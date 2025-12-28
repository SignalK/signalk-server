#!/bin/bash
#
# OIDC Flow Test Script for Signal K Server
#
# Tests the complete OIDC authentication flow and captures all
# requests, responses, headers, and tokens for debugging.
#
# This is a generic test script that works with any OIDC provider
# that supports username/password authentication flow.
#
# Usage:
#   ./test-oidc-flow.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -s, --signalk URL       Signal K server URL (required)
#   -a, --auth URL          OIDC provider URL (required)
#   -u, --username USER     OIDC username (default: admin)
#   -p, --password PASS     OIDC password (required)
#   -o, --output DIR        Output directory (default: /tmp/oidc_test_<timestamp>)
#   -v, --verbose           Show verbose output
#   -k, --insecure          Allow insecure SSL (self-signed certs)
#   --auth-type TYPE        Auth provider type: authelia, keycloak, generic (default: authelia)
#
# Environment variables (alternative to options):
#   SIGNALK_URL, AUTH_URL, AUTH_USERNAME, AUTH_PASSWORD, AUTH_TYPE
#
# Examples:
#   ./test-oidc-flow.sh -s https://signalk.local:3000 -a https://auth.local -p "MyPassword"
#   ./test-oidc-flow.sh -s https://signalk.local:3000 -a https://keycloak.local/realms/myrealm --auth-type keycloak -p "secret"
#

set -euo pipefail

# Default values
SIGNALK_URL="${SIGNALK_URL:-}"
AUTH_URL="${AUTH_URL:-}"
USERNAME="${AUTH_USERNAME:-admin}"
PASSWORD="${AUTH_PASSWORD:-}"
OUTPUT_DIR=""
VERBOSE=false
INSECURE=true  # Default to insecure for self-signed certs
AUTH_TYPE="${AUTH_TYPE:-authelia}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    sed -n '2,/^$/p' "$0" | grep '^#' | sed 's/^# \?//'
    exit 0
}

log() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_verbose() {
    if $VERBOSE; then
        echo -e "${BLUE}[DEBUG]${NC} $*"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            ;;
        -s|--signalk)
            SIGNALK_URL="$2"
            shift 2
            ;;
        -a|--auth)
            AUTH_URL="$2"
            shift 2
            ;;
        -u|--username)
            USERNAME="$2"
            shift 2
            ;;
        -p|--password)
            PASSWORD="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -k|--insecure)
            INSECURE=true
            shift
            ;;
        --auth-type)
            AUTH_TYPE="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$SIGNALK_URL" ]]; then
    log_error "Signal K URL is required. Use -s or set SIGNALK_URL"
    exit 1
fi

if [[ -z "$PASSWORD" ]]; then
    log_error "Password is required. Use -p or set AUTH_PASSWORD"
    exit 1
fi

# Set up output directory
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="/tmp/oidc_test_$(date +%Y%m%d_%H%M%S)"
fi
mkdir -p "$OUTPUT_DIR"

# Curl options
CURL_OPTS=(-s)
if $INSECURE; then
    CURL_OPTS+=(-k)
fi

# Helper function to decode JWT
decode_jwt() {
    local jwt="$1"
    local payload
    payload=$(echo "$jwt" | cut -d'.' -f2)
    # Add padding if needed
    local padding=$((4 - ${#payload} % 4))
    if [[ $padding -ne 4 ]]; then
        payload="${payload}$(printf '=%.0s' $(seq 1 $padding))"
    fi
    echo "$payload" | base64 -d 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "$payload"
}

# Helper to extract header value
get_header() {
    local file="$1"
    local header="$2"
    grep -i "^${header}:" "$file" 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r\n'
}

echo "=============================================="
echo "OIDC Flow Test for Signal K Server"
echo "=============================================="
echo ""
echo "Configuration:"
echo "  Signal K URL: $SIGNALK_URL"
echo "  Auth URL: ${AUTH_URL:-Auto-discover}"
echo "  Username: $USERNAME"
echo "  Auth Type: $AUTH_TYPE"
echo "  Output: $OUTPUT_DIR"
echo ""

cd "$OUTPUT_DIR"

# Initialize results
RESULTS=()
add_result() {
    RESULTS+=("$1")
}

#######################################
# Step 0: Check Signal K OIDC status
#######################################
log "Step 0: Checking Signal K OIDC status..."

LOGIN_STATUS=$(curl "${CURL_OPTS[@]}" "$SIGNALK_URL/skServer/loginStatus")
echo "$LOGIN_STATUS" > step0_login_status.json

OIDC_ENABLED=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcEnabled', False))" 2>/dev/null || echo "false")
OIDC_LOGIN_URL=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcLoginUrl', ''))" 2>/dev/null || echo "")

if [[ "$OIDC_ENABLED" == "True" || "$OIDC_ENABLED" == "true" ]]; then
    log_success "OIDC is enabled"
    add_result "Step 0: PASS - OIDC enabled"
else
    log_error "OIDC is not enabled on this Signal K server"
    add_result "Step 0: FAIL - OIDC not enabled"
    exit 1
fi

#######################################
# Step 1: Initiate OIDC Login
#######################################
log "Step 1: Initiating OIDC login..."

HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -D step1_headers.txt \
    -w "%{http_code}" \
    "$SIGNALK_URL/signalk/v1/auth/oidc/login" -o step1_body.html)

OIDC_REDIRECT=$(get_header step1_headers.txt "location")

if [[ "$HTTP_CODE" == "302" ]] && [[ -n "$OIDC_REDIRECT" ]]; then
    log_success "Got redirect to OIDC provider"
    log_verbose "Redirect URL: $OIDC_REDIRECT"
    add_result "Step 1: PASS - OIDC login initiated"

    # Auto-detect AUTH_URL from redirect if not provided
    if [[ -z "$AUTH_URL" ]]; then
        AUTH_URL=$(echo "$OIDC_REDIRECT" | sed -E 's|^(https?://[^/]+).*|\1|')
        log "Auto-detected Auth URL: $AUTH_URL"
    fi
else
    log_error "Failed to initiate OIDC login (HTTP $HTTP_CODE)"
    add_result "Step 1: FAIL - HTTP $HTTP_CODE"
    exit 1
fi

# Check OIDC state cookie
if grep -q "OIDC_STATE" cookies.txt; then
    COOKIE_DOMAIN=$(grep "OIDC_STATE" cookies.txt | awk '{print $1}')
    log_success "OIDC_STATE cookie set (domain: $COOKIE_DOMAIN)"
else
    log_warn "OIDC_STATE cookie not found - may be stored differently"
fi

#######################################
# Step 2: Follow redirect to OIDC provider
#######################################
log "Step 2: Following redirect to OIDC provider..."

# Follow redirects to get to the login page
FINAL_URL=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt -L \
    -w "%{url_effective}" \
    "$OIDC_REDIRECT" -o step2_body.html)

log_verbose "Final URL after redirects: $FINAL_URL"
add_result "Step 2: PASS - Reached OIDC provider"

#######################################
# Step 3: Authenticate with OIDC provider
#######################################
log "Step 3: Authenticating with OIDC provider ($AUTH_TYPE)..."

case "$AUTH_TYPE" in
    authelia)
        # Extract flow_id from URL
        FLOW_ID=$(echo "$FINAL_URL" | sed -n 's/.*flow_id=\([^&]*\).*/\1/p')

        if [[ -z "$FLOW_ID" ]]; then
            log_error "Failed to get flow ID from URL"
            add_result "Step 3: FAIL - No flow ID"
            exit 1
        fi

        AUTH_RESPONSE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
            -X POST "$AUTH_URL/api/firstfactor" \
            -H "Content-Type: application/json" \
            -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"keepMeLoggedIn\":false,\"flow\":\"openid_connect\",\"flowID\":\"$FLOW_ID\"}")

        echo "$AUTH_RESPONSE" > step3_auth_response.json

        AUTH_STATUS=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

        if [[ "$AUTH_STATUS" == "OK" ]]; then
            log_success "Authentication successful"
            add_result "Step 3: PASS - Authenticated"

            # Extract consent redirect
            CONSENT_REDIRECT=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('redirect',''))" 2>/dev/null | sed 's/\\u0026/\&/g')
        else
            log_error "Authentication failed: $AUTH_RESPONSE"
            add_result "Step 3: FAIL - Auth failed"
            exit 1
        fi
        ;;

    keycloak)
        # Keycloak uses form-based login
        # Extract the login form action URL
        ACTION_URL=$(sed -n 's/.*action="\([^"]*\)".*/\1/p' step2_body.html | head -1 | sed 's/&amp;/\&/g')

        if [[ -z "$ACTION_URL" ]]; then
            log_error "Could not find Keycloak login form"
            add_result "Step 3: FAIL - No login form"
            exit 1
        fi

        HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
            -X POST "$ACTION_URL" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "username=$USERNAME&password=$PASSWORD" \
            -D step3_headers.txt -w "%{http_code}" \
            -o step3_body.html)

        CONSENT_REDIRECT=$(get_header step3_headers.txt "location")

        if [[ -n "$CONSENT_REDIRECT" ]]; then
            log_success "Authentication successful"
            add_result "Step 3: PASS - Authenticated"
        else
            log_error "Authentication failed (HTTP $HTTP_CODE)"
            add_result "Step 3: FAIL - Auth failed"
            exit 1
        fi
        ;;

    generic)
        log_warn "Generic auth type requires manual authentication"
        log_warn "Please authenticate in the browser and press Enter when done"
        read -r
        add_result "Step 3: SKIP - Manual auth"
        ;;

    *)
        log_error "Unknown auth type: $AUTH_TYPE"
        exit 1
        ;;
esac

#######################################
# Step 4: Get Authorization Code
#######################################
log "Step 4: Getting authorization code..."

if [[ -n "${CONSENT_REDIRECT:-}" ]]; then
    HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
        -D step4_headers.txt -w "%{http_code}" \
        "$CONSENT_REDIRECT" -o step4_body.html)

    CALLBACK_URL=$(get_header step4_headers.txt "location")
fi

if [[ -n "${CALLBACK_URL:-}" ]] && [[ "$CALLBACK_URL" == *"code="* ]]; then
    AUTH_CODE=$(echo "$CALLBACK_URL" | sed -n 's/.*code=\([^&]*\).*/\1/p')
    STATE=$(echo "$CALLBACK_URL" | sed -n 's/.*state=\([^&]*\).*/\1/p')
    log_success "Got authorization code"
    log_verbose "Code: ${AUTH_CODE:0:50}..."
    log_verbose "State: $STATE"
    add_result "Step 4: PASS - Got auth code"
else
    log_error "Failed to get authorization code"
    add_result "Step 4: FAIL - No auth code"
    exit 1
fi

#######################################
# Step 5: Complete OIDC Callback
#######################################
log "Step 5: Completing OIDC callback to Signal K..."

# Ensure callback URL is absolute
if [[ "$CALLBACK_URL" == /* ]]; then
    CALLBACK_URL="${SIGNALK_URL}${CALLBACK_URL}"
fi

HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
    -D step5_headers.txt -L -w "%{http_code}" \
    "$CALLBACK_URL" -o step5_body.html)

# Check for error in redirect
FINAL_REDIRECT=$(get_header step5_headers.txt "location")
if [[ "$FINAL_REDIRECT" == *"oidcError=true"* ]]; then
    ERROR_MSG=$(echo "$FINAL_REDIRECT" | sed -n 's/.*message=\([^&]*\).*/\1/p' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))" 2>/dev/null || echo "unknown")
    log_error "OIDC callback failed: $ERROR_MSG"
    add_result "Step 5: FAIL - $ERROR_MSG"
else
    log_success "OIDC callback completed (HTTP $HTTP_CODE)"
    add_result "Step 5: PASS - Callback completed"
fi

#######################################
# Step 6: Check Login Status
#######################################
log "Step 6: Checking login status..."

LOGIN_STATUS=$(curl "${CURL_OPTS[@]}" -b cookies.txt "$SIGNALK_URL/skServer/loginStatus")
echo "$LOGIN_STATUS" > step6_login_status.json

USER_LEVEL=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userLevel',''))" 2>/dev/null || echo "")
USERNAME_SK=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null || echo "")
LOGGED_IN=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

echo ""
echo "Login Status:"
echo "$LOGIN_STATUS" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_STATUS"
echo ""

if [[ "$LOGGED_IN" == "loggedIn" ]]; then
    log_success "User logged in: $USERNAME_SK"
    log "User level: $USER_LEVEL"
    add_result "Step 6: PASS - Logged in as $USER_LEVEL"
else
    log_error "Not logged in"
    add_result "Step 6: FAIL - Not logged in"
fi

#######################################
# Step 7: Decode JWT Token
#######################################
log "Step 7: Analyzing JWT token..."

JWT=$(grep "JAUTHENTICATION" cookies.txt 2>/dev/null | awk '{print $NF}' || echo "")
if [[ -n "$JWT" ]]; then
    echo ""
    echo "JWT Token Payload:"
    decode_jwt "$JWT"
    echo ""

    # Save decoded token
    decode_jwt "$JWT" > step7_jwt_decoded.json
    add_result "Step 7: PASS - JWT decoded"
else
    log_warn "No JWT token found in cookies"
    add_result "Step 7: SKIP - No JWT"
fi

#######################################
# Summary
#######################################
echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
PASS_COUNT=0
FAIL_COUNT=0
for result in "${RESULTS[@]}"; do
    if [[ "$result" == *"PASS"* ]]; then
        echo -e "${GREEN}✓${NC} $result"
        ((PASS_COUNT++))
    elif [[ "$result" == *"FAIL"* ]]; then
        echo -e "${RED}✗${NC} $result"
        ((FAIL_COUNT++))
    else
        echo -e "${YELLOW}○${NC} $result"
    fi
done

echo ""
echo "Passed: $PASS_COUNT, Failed: $FAIL_COUNT"
echo "Output files saved to: $OUTPUT_DIR"

# Exit with error if any failures
if [[ $FAIL_COUNT -gt 0 ]]; then
    exit 1
fi

# Warn if user level is not admin when it should be
if [[ "$USER_LEVEL" == "readonly" ]]; then
    echo ""
    log_warn "User has readonly permissions. Check groups claim in your OIDC provider."
    exit 2
fi
