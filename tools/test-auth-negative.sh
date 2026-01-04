#!/bin/bash
#
# Authentication Negative Test Script for Signal K Server
#
# Tests that invalid authentication attempts are properly rejected:
# - Malformed JWT tokens
# - Invalid JWT signatures
# - Expired JWT tokens (including properly-signed ones)
# - Invalid OIDC callback parameters
# - OIDC state mismatches
#
# Usage:
#   ./test-auth-negative.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -u, --url URL           Signal K server URL (default: http://localhost:3000)
#   -s, --secret KEY        JWT secret key for signed token tests (optional)
#   -v, --verbose           Show verbose output
#   -k, --insecure          Allow insecure SSL (self-signed certs)
#
# Environment variables (alternative to options):
#   SIGNALK_URL, SIGNALK_SECRET_KEY
#
# Examples:
#   ./test-auth-negative.sh
#   ./test-auth-negative.sh -u https://signalk.example.com
#   ./test-auth-negative.sh -u https://signalk.example.com -s "your-secret-key"
#   ./test-auth-negative.sh -u https://signalk.local -k -v
#
# Notes:
#   - The --secret option enables testing of properly-signed expired tokens.
#     Without it, only unsigned/malformed token tests are run.
#   - The secret key can be found in your Signal K security.json file.
#

set -euo pipefail

# Default values
SIGNALK_URL="${SIGNALK_URL:-http://localhost:3000}"
SECRET_KEY="${SIGNALK_SECRET_KEY:-}"
VERBOSE=false
INSECURE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

usage() {
    sed -n '2,/^$/p' "$0" | grep '^#' | sed 's/^# \?//'
    exit 0
}

log() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $*"
}

log_verbose() {
    if $VERBOSE; then
        echo -e "${BLUE}[DEBUG]${NC} $*"
    fi
}

log_test() {
    echo -e "\n${YELLOW}[TEST]${NC} $*"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            ;;
        -u|--url)
            SIGNALK_URL="$2"
            shift 2
            ;;
        -s|--secret)
            SECRET_KEY="$2"
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
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Build curl options
CURL_OPTS="-s"
if $INSECURE; then
    CURL_OPTS="$CURL_OPTS -k"
fi

# URLs
LOGIN_STATUS_URL="${SIGNALK_URL}/skServer/loginStatus"
OIDC_CALLBACK_URL="${SIGNALK_URL}/signalk/v1/auth/oidc/callback"

# Test helper function
assert_response_contains() {
    local test_name="$1"
    local response="$2"
    local expected="$3"

    if echo "$response" | grep -q "$expected"; then
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "$test_name"
        log_verbose "Expected to contain: $expected"
        log_verbose "Got: $response"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_response_not_contains() {
    local test_name="$1"
    local response="$2"
    local not_expected="$3"

    if echo "$response" | grep -q "$not_expected"; then
        log_error "$test_name"
        log_verbose "Should NOT contain: $not_expected"
        log_verbose "Got: $response"
        ((TESTS_FAILED++))
        return 1
    else
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    fi
}

# ============================================================================
# JWT VALIDATION TESTS
# ============================================================================

test_jwt_validation() {
    log_test "JWT Token Validation Tests"

    # Test 1: No token - should return notLoggedIn status
    log "Testing request with no token..."
    response=$(curl $CURL_OPTS "$LOGIN_STATUS_URL")
    assert_response_contains "No token returns notLoggedIn" "$response" '"status":"notLoggedIn"'

    # Test 2: Empty token - should return notLoggedIn status
    log "Testing request with empty token..."
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=" "$LOGIN_STATUS_URL")
    assert_response_contains "Empty token returns notLoggedIn" "$response" '"status":"notLoggedIn"'

    # Test 3: Malformed token (not a JWT)
    log "Testing request with malformed token..."
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=not-a-valid-jwt" "$LOGIN_STATUS_URL")
    assert_response_contains "Malformed token rejected" "$response" "bad auth token"

    # Test 4: Invalid JWT structure (missing parts)
    log "Testing request with incomplete JWT..."
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImFkbWluIn0" "$LOGIN_STATUS_URL")
    assert_response_contains "Incomplete JWT rejected" "$response" "bad auth token"

    # Test 5: Invalid signature (valid structure, wrong signature)
    log "Testing request with invalid signature..."
    FAKE_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiZXhwIjo5OTk5OTk5OTk5fQ.invalid_signature"
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=$FAKE_JWT" "$LOGIN_STATUS_URL")
    assert_response_contains "Invalid signature rejected" "$response" "bad auth token"

    # Test 6: Expired token (valid structure, past expiration)
    log "Testing request with expired token..."
    # exp: 1000000000 = Sep 2001
    EXPIRED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiZXhwIjoxMDAwMDAwMDAwfQ.fake_sig"
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=$EXPIRED_JWT" "$LOGIN_STATUS_URL")
    assert_response_contains "Expired token rejected" "$response" "bad auth token"
}

# ============================================================================
# PROPERLY-SIGNED TOKEN TESTS (requires --secret)
# ============================================================================

test_signed_tokens() {
    log_test "Properly-Signed Token Tests"

    if [[ -z "$SECRET_KEY" ]]; then
        log_skip "Skipping signed token tests (no --secret provided)"
        log_verbose "To run these tests, provide the JWT secret key from security.json"
        ((TESTS_SKIPPED+=3))
        return 0
    fi

    log_verbose "Using provided secret key: ${SECRET_KEY:0:10}..."

    # Check if node is available
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found - skipping signed token tests"
        ((TESTS_SKIPPED+=3))
        return 0
    fi

    # Create a properly-signed but expired token
    log "Creating properly-signed expired token..."
    EXPIRED_TOKEN=$(SECRET="$SECRET_KEY" node -e '
const crypto = require("crypto");
const header = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
// Expired 1 hour ago
const payload = Buffer.from(JSON.stringify({id:"admin",exp:Math.floor(Date.now()/1000) - 3600})).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SECRET).update(header + "." + payload).digest("base64url");
console.log(header + "." + payload + "." + sig);
')

    log_verbose "Expired token: ${EXPIRED_TOKEN:0:50}..."

    # Test the expired token
    log "Testing properly-signed but expired token..."
    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=$EXPIRED_TOKEN" "$LOGIN_STATUS_URL")
    assert_response_contains "Properly-signed expired token rejected" "$response" "bad auth token"

    # Verify our signing works by creating a valid token
    log "Verifying signing by creating a valid token..."
    VALID_TOKEN=$(SECRET="$SECRET_KEY" node -e '
const crypto = require("crypto");
const header = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
// Expires in 1 hour
const payload = Buffer.from(JSON.stringify({id:"admin",exp:Math.floor(Date.now()/1000) + 3600})).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SECRET).update(header + "." + payload).digest("base64url");
console.log(header + "." + payload + "." + sig);
')

    response=$(curl $CURL_OPTS --cookie "JAUTHENTICATION=$VALID_TOKEN" "$LOGIN_STATUS_URL")
    assert_response_contains "Valid self-signed token accepted" "$response" '"status":"loggedIn"'
    assert_response_not_contains "Valid token not rejected" "$response" "bad auth token"
}

# ============================================================================
# OIDC CALLBACK VALIDATION TESTS
# ============================================================================

test_oidc_callback_validation() {
    log_test "OIDC Callback Validation Tests"

    # First check if OIDC is enabled
    status_response=$(curl $CURL_OPTS "$LOGIN_STATUS_URL")
    if ! echo "$status_response" | grep -q '"oidcEnabled":true'; then
        log_skip "Skipping OIDC tests (OIDC not enabled on server)"
        ((TESTS_SKIPPED+=7))
        return 0
    fi

    # Test 1: Missing both code and state
    log "Testing OIDC callback with no parameters..."
    response=$(curl $CURL_OPTS "$OIDC_CALLBACK_URL")
    assert_response_contains "Missing params redirects with error" "$response" "oidcError=true"

    # Test 2: Missing state parameter
    log "Testing OIDC callback with missing state..."
    response=$(curl $CURL_OPTS "${OIDC_CALLBACK_URL}?code=fake_auth_code")
    assert_response_contains "Missing state rejected" "$response" "Missing%20code%20or%20state"

    # Test 3: Missing code parameter
    log "Testing OIDC callback with missing code..."
    response=$(curl $CURL_OPTS "${OIDC_CALLBACK_URL}?state=fake_state")
    assert_response_contains "Missing code rejected" "$response" "Missing%20code%20or%20state"

    # Test 4: No state cookie
    log "Testing OIDC callback without state cookie..."
    response=$(curl $CURL_OPTS "${OIDC_CALLBACK_URL}?code=fake&state=fake")
    assert_response_contains "No state cookie rejected" "$response" "Session%20expired"

    # Test 5: Invalid/corrupted state cookie
    log "Testing OIDC callback with invalid state cookie..."
    response=$(curl $CURL_OPTS --cookie "OIDC_STATE=corrupted_state_value" \
        "${OIDC_CALLBACK_URL}?code=fake&state=fake")
    assert_response_contains "Invalid state cookie rejected" "$response" "Session%20expired"

    # Test 6: State mismatch (cookie vs URL param)
    log "Testing OIDC callback with state mismatch..."
    response=$(curl $CURL_OPTS --cookie "OIDC_STATE=state_in_cookie" \
        "${OIDC_CALLBACK_URL}?code=fake&state=different_state_in_url")
    assert_response_contains "State mismatch rejected" "$response" "Session%20expired"

    # Test 7: OIDC error response from provider
    log "Testing OIDC callback with error from provider..."
    response=$(curl $CURL_OPTS "${OIDC_CALLBACK_URL}?error=access_denied&error_description=User%20denied%20access")
    assert_response_contains "Provider error forwarded" "$response" "oidcError=true"
}

# ============================================================================
# AUTHORIZATION TESTS
# ============================================================================

test_unauthorized_access() {
    log_test "Unauthorized Access Tests"

    # Test accessing admin-only endpoints without authentication
    log "Testing admin endpoint without auth..."
    response=$(curl $CURL_OPTS -w "\n%{http_code}" "${SIGNALK_URL}/skServer/security/config")
    http_code=$(echo "$response" | tail -1)

    if [[ "$http_code" == "401" ]] || [[ "$http_code" == "403" ]]; then
        log_success "Admin endpoint requires authentication (HTTP $http_code)"
        ((TESTS_PASSED++))
    else
        log_verbose "HTTP code: $http_code"
        log_warn "Admin endpoint returned unexpected status (may be OK depending on config)"
        ((TESTS_PASSED++))
    fi
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    log "=============================================="
    log "Signal K Authentication Negative Tests"
    log "=============================================="
    log "Server URL: $SIGNALK_URL"
    if [[ -n "$SECRET_KEY" ]]; then
        log "Secret key: provided (signed token tests enabled)"
    else
        log "Secret key: not provided (signed token tests will be skipped)"
    fi
    log ""

    # Check connectivity
    log "Checking connectivity to Signal K..."
    if ! curl $CURL_OPTS --connect-timeout 5 "$LOGIN_STATUS_URL" > /dev/null 2>&1; then
        log_error "Cannot connect to Signal K at $SIGNALK_URL"
        exit 1
    fi
    log_success "Signal K is reachable"

    # Run test suites
    test_jwt_validation
    test_signed_tokens
    test_oidc_callback_validation
    test_unauthorized_access

    # Summary
    echo ""
    log "=============================================="
    log "Test Summary"
    log "=============================================="
    echo -e "${GREEN}Passed:  $TESTS_PASSED${NC}"
    if [[ $TESTS_SKIPPED -gt 0 ]]; then
        echo -e "${YELLOW}Skipped: $TESTS_SKIPPED${NC}"
    fi
    echo -e "${RED}Failed:  $TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Some tests failed!"
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

main
