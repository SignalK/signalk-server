#!/bin/bash
#
# Comprehensive OIDC Test Suite for Signal K Server
#
# Tests all OIDC functionality including:
# - OIDC configuration status
# - Auto-login configuration
# - Admin permissions mapping
# - Full login flow
#
# Usage:
#   ./test-oidc-all.sh [options]
#
# Options:
#   -s, --signalk URL       Signal K server URL (required)
#   -a, --auth URL          OIDC provider URL (auto-detected if not provided)
#   -u, --username USER     OIDC username (default: admin)
#   -p, --password PASS     OIDC password (required)
#   -v, --verbose           Show verbose output
#   --auth-type TYPE        Auth provider type: authelia, keycloak, generic (default: authelia)
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

# Colors
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
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; }
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
        --auth-type) AUTH_TYPE="$2"; shift 2 ;;
        *) log_fail "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$SIGNALK_URL" ]]; then
    log_fail "Signal K URL is required. Use -s or set SIGNALK_URL"
    exit 1
fi

if [[ -z "$PASSWORD" ]]; then
    log_fail "Password is required. Use -p or set AUTH_PASSWORD"
    exit 1
fi

CURL_OPTS=(-s -k)

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

test_result() {
    local name="$1"
    local passed="$2"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [[ "$passed" == "true" ]]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        log_success "$name"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        log_fail "$name"
    fi
}

echo "=============================================="
echo "OIDC Comprehensive Test Suite"
echo "=============================================="
echo ""
echo "Target: $SIGNALK_URL"
echo "Auth Type: $AUTH_TYPE"
echo ""

#######################################
# TEST 1: OIDC Configuration Status
#######################################
echo ""
echo "--- Test 1: OIDC Configuration Status ---"

LOGIN_STATUS=$(curl "${CURL_OPTS[@]}" "$SIGNALK_URL/skServer/loginStatus")
log_verbose "Login status: $LOGIN_STATUS"

OIDC_ENABLED=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcEnabled', False))" 2>/dev/null || echo "false")
OIDC_AUTO_LOGIN=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcAutoLogin', False))" 2>/dev/null || echo "false")
OIDC_LOGIN_URL=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcLoginUrl', ''))" 2>/dev/null || echo "")
OIDC_PROVIDER_NAME=$(echo "$LOGIN_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('oidcProviderName', ''))" 2>/dev/null || echo "")

test_result "1.1 OIDC is enabled" "$( [[ "$OIDC_ENABLED" == "True" || "$OIDC_ENABLED" == "true" ]] && echo true || echo false )"
test_result "1.2 OIDC login URL is set" "$( [[ -n "$OIDC_LOGIN_URL" ]] && echo true || echo false )"

if [[ -n "$OIDC_PROVIDER_NAME" ]]; then
    log "Provider name: $OIDC_PROVIDER_NAME"
fi

if [[ "$OIDC_AUTO_LOGIN" == "True" || "$OIDC_AUTO_LOGIN" == "true" ]]; then
    log "Auto-login is enabled"
fi

#######################################
# TEST 2: OIDC Login Redirect
#######################################
echo ""
echo "--- Test 2: OIDC Login Redirect ---"

OUTPUT_DIR=$(mktemp -d)
cd "$OUTPUT_DIR"

HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -D headers.txt \
    -w "%{http_code}" \
    "$SIGNALK_URL/signalk/v1/auth/oidc/login" -o body.html)

LOCATION=$(grep -i "^location:" headers.txt 2>/dev/null | head -1 | cut -d' ' -f2- | tr -d '\r\n')

test_result "2.1 OIDC login returns redirect (302)" "$( [[ "$HTTP_CODE" == "302" ]] && echo true || echo false )"
test_result "2.2 Redirect URL is set" "$( [[ -n "$LOCATION" ]] && echo true || echo false )"
test_result "2.3 OIDC_STATE cookie is set" "$( grep -q "OIDC_STATE" cookies.txt && echo true || echo false )"

# Auto-detect AUTH_URL if not provided
if [[ -z "$AUTH_URL" ]] && [[ -n "$LOCATION" ]]; then
    AUTH_URL=$(echo "$LOCATION" | sed -E 's|^(https?://[^/]+).*|\1|')
    log "Auto-detected Auth URL: $AUTH_URL"
fi

#######################################
# TEST 3: Full Login Flow & Permissions
#######################################
echo ""
echo "--- Test 3: Full Login Flow & Permissions ---"

# Follow redirect to OIDC provider
FINAL_URL=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt -L \
    -w "%{url_effective}" \
    "$LOCATION" -o auth_page.html)

log_verbose "Auth page URL: $FINAL_URL"

# Authenticate based on provider type
case "$AUTH_TYPE" in
    authelia)
        FLOW_ID=$(echo "$FINAL_URL" | sed -n 's/.*flow_id=\([^&]*\).*/\1/p')
        test_result "3.1 Got auth flow ID" "$( [[ -n "$FLOW_ID" ]] && echo true || echo false )"

        if [[ -n "$FLOW_ID" ]]; then
            AUTH_RESPONSE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
                -X POST "$AUTH_URL/api/firstfactor" \
                -H "Content-Type: application/json" \
                -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"keepMeLoggedIn\":true,\"flow\":\"openid_connect\",\"flowID\":\"$FLOW_ID\"}")

            AUTH_STATUS=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
            test_result "3.2 Authentication succeeded" "$( [[ "$AUTH_STATUS" == "OK" ]] && echo true || echo false )"

            # Get consent redirect and auth code
            CONSENT_REDIRECT=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('redirect',''))" 2>/dev/null | sed 's/\\u0026/\&/g')

            if [[ -n "$CONSENT_REDIRECT" ]]; then
                HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
                    -D consent_headers.txt -w "%{http_code}" \
                    "$CONSENT_REDIRECT" -o consent.html)

                CALLBACK_URL=$(grep -i "^location:" consent_headers.txt 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r\n')
            fi
        fi
        ;;

    keycloak)
        ACTION_URL=$(grep -oP 'action="[^"]*"' auth_page.html | head -1 | sed 's/action="//;s/"$//' | sed 's/&amp;/\&/g')
        test_result "3.1 Found login form" "$( [[ -n "$ACTION_URL" ]] && echo true || echo false )"

        if [[ -n "$ACTION_URL" ]]; then
            HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
                -X POST "$ACTION_URL" \
                -H "Content-Type: application/x-www-form-urlencoded" \
                -d "username=$USERNAME&password=$PASSWORD" \
                -D auth_headers.txt -w "%{http_code}" \
                -o auth_response.html)

            CALLBACK_URL=$(grep -i "^location:" auth_headers.txt 2>/dev/null | tail -1 | cut -d' ' -f2- | tr -d '\r\n')
            test_result "3.2 Authentication succeeded" "$( [[ -n "$CALLBACK_URL" ]] && echo true || echo false )"
        fi
        ;;

    *)
        log_warn "Unknown auth type: $AUTH_TYPE - skipping authentication"
        CALLBACK_URL=""
        ;;
esac

# Ensure callback URL is absolute
if [[ -n "${CALLBACK_URL:-}" ]] && [[ "$CALLBACK_URL" == /* ]]; then
    CALLBACK_URL="${SIGNALK_URL}${CALLBACK_URL}"
fi

test_result "3.3 Got authorization code" "$( [[ "${CALLBACK_URL:-}" == *"code="* ]] && echo true || echo false )"

# Complete callback
if [[ -n "${CALLBACK_URL:-}" ]]; then
    log_verbose "Calling callback: $CALLBACK_URL"
    HTTP_CODE=$(curl "${CURL_OPTS[@]}" -c cookies.txt -b cookies.txt \
        -D callback_headers.txt -L -w "%{http_code}" \
        "$CALLBACK_URL" -o callback.html)

    JAUTH_SET=$(grep -q "JAUTHENTICATION" cookies.txt && echo "true" || echo "false")
    log_verbose "JAUTHENTICATION cookie set: $JAUTH_SET"

    test_result "3.4 OIDC callback completed" "$( [[ "$HTTP_CODE" == "200" ]] && echo true || echo false )"
    test_result "3.5 Session cookie set" "$JAUTH_SET"

    # Verify login status
    FINAL_STATUS=$(curl "${CURL_OPTS[@]}" -b cookies.txt "$SIGNALK_URL/skServer/loginStatus")
    log_verbose "Final status: $FINAL_STATUS"

    LOGGED_IN=$(echo "$FINAL_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
    USER_LEVEL=$(echo "$FINAL_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userLevel',''))" 2>/dev/null || echo "")
    USERNAME_SK=$(echo "$FINAL_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('username',''))" 2>/dev/null || echo "")

    test_result "3.6 User is logged in" "$( [[ "$LOGGED_IN" == "loggedIn" ]] && echo true || echo false )"
    test_result "3.7 User has admin permissions" "$( [[ "$USER_LEVEL" == "admin" ]] && echo true || echo false )"

    if [[ "$LOGGED_IN" == "loggedIn" ]]; then
        log "Logged in as: $USERNAME_SK ($USER_LEVEL)"
    fi
fi

#######################################
# Summary
#######################################
echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "Total:  $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

# Cleanup
rm -rf "$OUTPUT_DIR"

if [[ $FAILED_TESTS -gt 0 ]]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
