#!/bin/bash
#
# SSO Flow Test Script for Signal K Server
#
# Tests that a user who is already authenticated with the OIDC provider
# can seamlessly access Signal K without re-authenticating.
#
# This tests the SSO (Single Sign-On) behavior - the OIDC provider session
# should allow direct access without showing a login page again.
#
# Usage:
#   ./test-oidc-sso.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -s, --signalk URL       Signal K server URL (required)
#   -a, --auth URL          OIDC provider URL (auto-detected if not provided)
#   -u, --username USER     OIDC username (default: admin)
#   -p, --password PASS     OIDC password (required)
#   -v, --verbose           Show verbose output
#   --auth-type TYPE        Auth provider type: authelia, keycloak, generic (default: authelia)
#
# Test Scenarios:
#   1. Authenticate with OIDC provider directly (simulating prior login)
#   2. Verify OIDC provider session cookie is set
#   3. Access Signal K OIDC login with existing session
#   4. Verify no re-authentication is required (automatic consent)
#   5. Verify Signal K login succeeds with correct permissions
#
# Environment variables (alternative to options):
#   SIGNALK_URL, AUTH_URL, AUTH_USERNAME, AUTH_PASSWORD, AUTH_TYPE
#

set -euo pipefail

# Default values
SIGNALK_URL="${SIGNALK_URL:-}"
AUTH_URL="${AUTH_URL:-}"
USERNAME="${AUTH_USERNAME:-admin}"
PASSWORD="${AUTH_PASSWORD:-}"
VERBOSE=false
INSECURE=true
AUTH_TYPE="${AUTH_TYPE:-authelia}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    sed -n '2,/^$/p' "$0" | grep '^#' | sed 's/^# \?//'
    exit 0
}

log() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_verbose() { $VERBOSE && echo -e "${BLUE}[DEBUG]${NC} $*" || true; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) usage ;;
        -s|--signalk) SIGNALK_URL="$2"; shift 2 ;;
        -a|--auth) AUTH_URL="$2"; shift 2 ;;
        -u|--username) USERNAME="$2"; shift 2 ;;
        -p|--password) PASSWORD="$2"; shift 2 ;;
        -v|--verbose) VERBOSE=true; shift ;;
        -k|--insecure) INSECURE=true; shift ;;
        --auth-type) AUTH_TYPE="$2"; shift 2 ;;
        *) log_error "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$SIGNALK_URL" ]]; then
    log_error "Signal K URL is required. Use -s or set SIGNALK_URL"
    exit 1
fi

if [[ -z "$PASSWORD" ]]; then
    log_error "Password is required. Use -p or set AUTH_PASSWORD"
    exit 1
fi

# Output directory
OUTPUT_DIR="/tmp/sso_test_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

CURL_OPTS=(-s)
if $INSECURE; then
    CURL_OPTS+=(-k)
fi
RESULTS=()
add_result() { RESULTS+=("$1"); }

echo "=============================================="
echo "SSO Flow Test for Signal K Server"
echo "=============================================="
echo ""
echo "Configuration:"
echo "  Signal K URL: $SIGNALK_URL"
echo "  Auth URL: ${AUTH_URL:-Will auto-detect}"
echo "  Auth Type: $AUTH_TYPE"
echo "  Output: $OUTPUT_DIR"
echo ""

#######################################
# Step 1: Get OIDC provider URL from Signal K
#######################################
log "Step 1: Discovering OIDC provider..."

# First, initiate OIDC to discover the provider URL
HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -D step1_headers.txt \
    -w "%{http_code}" \
    "$SIGNALK_URL/signalk/v1/auth/oidc/login" -o step1_body.html)

OIDC_REDIRECT=$(grep -i "^location:" step1_headers.txt 2>/dev/null | head -1 | cut -d' ' -f2- | tr -d '\r\n')

if [[ "$HTTP_CODE" == "302" ]] && [[ -n "$OIDC_REDIRECT" ]]; then
    log_success "Got OIDC provider redirect"

    # Auto-detect AUTH_URL from redirect if not provided
    if [[ -z "$AUTH_URL" ]]; then
        AUTH_URL=$(echo "$OIDC_REDIRECT" | sed -E 's|^(https?://[^/]+).*|\1|')
        log "Auto-detected Auth URL: $AUTH_URL"
    fi
    add_result "Step 1: PASS - OIDC provider discovered"
else
    log_error "Failed to get OIDC redirect (HTTP $HTTP_CODE)"
    add_result "Step 1: FAIL - Could not discover OIDC provider"
    exit 1
fi

# Clear cookies - we want to test SSO with fresh Signal K state
rm -f cookies.txt

#######################################
# Step 2: Authenticate directly with OIDC provider
# (simulating login through another app)
#######################################
log "Step 2: Authenticating directly with OIDC provider..."

case "$AUTH_TYPE" in
    authelia)
        # Visit Authelia to get a session
        curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
            "$AUTH_URL/" -o step2a_home.html

        # Authenticate
        AUTH_RESPONSE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
            -X POST "$AUTH_URL/api/firstfactor" \
            -H "Content-Type: application/json" \
            -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"keepMeLoggedIn\":true}")

        echo "$AUTH_RESPONSE" > step2_auth_response.json

        AUTH_STATUS=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")

        if [[ "$AUTH_STATUS" == "OK" ]]; then
            log_success "Authenticated with OIDC provider"
            add_result "Step 2: PASS - Direct authentication"
        else
            log_error "Authentication failed: $AUTH_RESPONSE"
            add_result "Step 2: FAIL - Direct authentication"
            exit 1
        fi
        ;;

    keycloak)
        # For Keycloak, we need to go through the login page
        # First get the login page
        curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt -L \
            "$AUTH_URL/protocol/openid-connect/auth?client_id=account&response_type=code" \
            -o step2a_login.html

        ACTION_URL=$(sed -n 's/.*action="\([^"]*\)".*/\1/p' step2a_login.html | head -1 | sed 's/&amp;/\&/g')

        if [[ -n "$ACTION_URL" ]]; then
            curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
                -X POST "$ACTION_URL" \
                -H "Content-Type: application/x-www-form-urlencoded" \
                -d "username=$USERNAME&password=$PASSWORD" \
                -D step2_headers.txt -o step2_response.html

            if grep -q "KEYCLOAK_SESSION" cookies.txt 2>/dev/null; then
                log_success "Authenticated with Keycloak"
                add_result "Step 2: PASS - Direct authentication"
            else
                log_error "Keycloak authentication may have failed"
                add_result "Step 2: WARN - Check Keycloak session"
            fi
        else
            log_error "Could not find Keycloak login form"
            add_result "Step 2: FAIL - No login form"
            exit 1
        fi
        ;;

    *)
        log_warn "Unknown auth type - skipping direct auth"
        add_result "Step 2: SKIP - Unknown auth type"
        ;;
esac

#######################################
# Step 3: Verify OIDC provider session cookie
#######################################
log "Step 3: Checking OIDC provider session..."

echo "Cookies after provider login:" > step3_cookies.txt
cat cookies.txt >> step3_cookies.txt

case "$AUTH_TYPE" in
    authelia)
        if grep -q "authelia_session" cookies.txt; then
            log_success "Authelia session cookie found"
            add_result "Step 3: PASS - Session cookie set"
        else
            log_warn "No authelia_session cookie found"
            add_result "Step 3: WARN - Session cookie not found"
        fi
        ;;
    keycloak)
        if grep -q "KEYCLOAK_SESSION" cookies.txt; then
            log_success "Keycloak session cookie found"
            add_result "Step 3: PASS - Session cookie set"
        else
            log_warn "No Keycloak session cookie found"
            add_result "Step 3: WARN - Session cookie not found"
        fi
        ;;
    *)
        add_result "Step 3: SKIP - Unknown provider"
        ;;
esac

#######################################
# Step 4: Access Signal K OIDC with existing session
#######################################
log "Step 4: Initiating Signal K OIDC login with existing session..."

# Start OIDC flow - should use existing provider session
HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
    -D step4_headers.txt -w "%{http_code}" \
    "$SIGNALK_URL/signalk/v1/auth/oidc/login" -o step4_body.html)

OIDC_REDIRECT=$(grep -i "^location:" step4_headers.txt 2>/dev/null | head -1 | cut -d' ' -f2- | tr -d '\r\n')

if [[ "$HTTP_CODE" == "302" ]] && [[ -n "$OIDC_REDIRECT" ]]; then
    log_success "Got redirect to OIDC provider"
    add_result "Step 4: PASS - OIDC redirect"
else
    log_error "Failed to get OIDC redirect (HTTP $HTTP_CODE)"
    add_result "Step 4: FAIL - No OIDC redirect"
    exit 1
fi

#######################################
# Step 5: Follow redirect - should skip login (SSO)
#######################################
log "Step 5: Following redirect (should use existing session)..."

# Follow redirects - with an existing session, provider should redirect directly
HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
    -D step5_headers.txt -L -w "%{http_code}" \
    --max-redirs 10 \
    "$OIDC_REDIRECT" -o step5_body.html 2>&1)

# Check if we got a callback with code (SSO worked) or ended at login page
FINAL_LOCATION=$(grep -i "^location:" step5_headers.txt 2>/dev/null | grep "code=" | head -1 | cut -d' ' -f2- | tr -d '\r\n')
BODY_CONTENT=$(cat step5_body.html)

log_verbose "Final HTTP code: $HTTP_CODE"
log_verbose "Looking for code in redirects..."

# Check if we need to re-authenticate (SSO failure)
if echo "$BODY_CONTENT" | grep -qi "sign in\|login\|password" && [[ "$HTTP_CODE" == "200" ]]; then
    log_error "SSO FAILED: Provider is showing login page instead of using existing session"
    add_result "Step 5: FAIL - SSO not working (login page shown)"
    exit 1
fi

# Check if we got an authorization code (success)
CALLBACK_URL=""
if [[ -n "$FINAL_LOCATION" ]]; then
    CALLBACK_URL="$FINAL_LOCATION"
    log_success "SSO SUCCESS: Got authorization code without re-authentication"
    add_result "Step 5: PASS - SSO worked (no re-auth needed)"
else
    # Check all redirects for a callback URL
    CALLBACK_URL=$(grep -i "^location:" step5_headers.txt 2>/dev/null | grep "code=" | tail -1 | cut -d' ' -f2- | tr -d '\r\n')
    if [[ -n "$CALLBACK_URL" ]]; then
        log_success "SSO SUCCESS: Got authorization code"
        add_result "Step 5: PASS - SSO worked"
    else
        log_warn "Did not get auth code directly - may need consent"
        add_result "Step 5: WARN - Check consent flow"
    fi
fi

#######################################
# Step 6: Complete Signal K callback
#######################################
if [[ -n "$CALLBACK_URL" ]]; then
    log "Step 6: Completing Signal K OIDC callback..."

    # Ensure callback URL is absolute
    if [[ "$CALLBACK_URL" == /* ]]; then
        CALLBACK_URL="${SIGNALK_URL}${CALLBACK_URL}"
    fi

    HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
        -D step6_headers.txt -L -w "%{http_code}" \
        "$CALLBACK_URL" -o step6_body.html)

    FINAL_REDIRECT=$(grep -i "^location:" step6_headers.txt 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r\n')

    if [[ "$FINAL_REDIRECT" == *"oidcError=true"* ]]; then
        ERROR_MSG=$(echo "$FINAL_REDIRECT" | sed -n 's/.*message=\([^&]*\).*/\1/p' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))" 2>/dev/null || echo "unknown")
        log_error "OIDC callback failed: $ERROR_MSG"
        add_result "Step 6: FAIL - $ERROR_MSG"
    else
        log_success "OIDC callback completed"
        add_result "Step 6: PASS - Callback completed"
    fi
else
    log_warn "Skipping callback - no authorization code obtained"
    add_result "Step 6: SKIP - No auth code"
fi

#######################################
# Step 7: Verify login status
#######################################
log "Step 7: Verifying Signal K login status..."

LOGIN_STATUS=$(curl "${CURL_OPTS[@]}" -b cookies.txt "$SIGNALK_URL/skServer/loginStatus")
echo "$LOGIN_STATUS" > step7_login_status.json

USER_LEVEL=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userLevel',''))" 2>/dev/null || echo "")
LOGGED_IN=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
USERNAME_SK=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null || echo "")

echo ""
echo "Login Status:"
echo "$LOGIN_STATUS" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_STATUS"
echo ""

if [[ "$LOGGED_IN" == "loggedIn" ]]; then
    log_success "User logged in: $USERNAME_SK"
    log "User level: $USER_LEVEL"

    if [[ "$USER_LEVEL" == "admin" ]]; then
        add_result "Step 7: PASS - Logged in as admin"
    else
        add_result "Step 7: WARN - Logged in as $USER_LEVEL (expected admin)"
    fi
else
    log_error "Not logged in!"
    add_result "Step 7: FAIL - Not logged in"
fi

#######################################
# Summary
#######################################
echo ""
echo "=============================================="
echo "SSO Test Summary"
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

# Overall result
if [[ $FAIL_COUNT -gt 0 ]]; then
    echo ""
    log_error "SSO TEST FAILED"
    exit 1
else
    echo ""
    log_success "SSO TEST PASSED"
    exit 0
fi
