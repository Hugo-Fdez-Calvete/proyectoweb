"""Cliente HTTP mínimo para Google OAuth 2.0 y YouTube Data API v3.

Solo usa `requests` (ya está en requirements.txt).
"""
from urllib.parse import urlencode

import requests

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
YT_API = "https://www.googleapis.com/youtube/v3/"

# openid/email/profile: nombre y foto · youtube.readonly: listas, «Me gusta», suscripciones
SCOPES = "openid email profile https://www.googleapis.com/auth/youtube.readonly"

TIMEOUT = 12


class GoogleApiError(Exception):
    def __init__(self, status, reason="", message=""):
        super().__init__(message or reason or f"HTTP {status}")
        self.status = status
        self.reason = reason
        self.message = message or reason or f"HTTP {status}"


def _raise_for(resp):
    if resp.ok:
        return
    reason, message = "", ""
    try:
        data = resp.json()
        err = data.get("error")
        if isinstance(err, dict):
            message = err.get("message", "")
            errors = err.get("errors") or []
            reason = errors[0].get("reason", "") if errors else err.get("status", "")
        else:
            reason = err or ""
            message = data.get("error_description", "")
    except ValueError:
        message = resp.text[:200]
    raise GoogleApiError(resp.status_code, reason, message)


def auth_url(client_id, redirect_uri, state, force_consent=False):
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",           # para recibir refresh_token
        "include_granted_scopes": "true",
        "prompt": "consent select_account" if force_consent else "select_account",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(client_id, client_secret, redirect_uri, code):
    resp = requests.post(TOKEN_URL, data={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=TIMEOUT)
    _raise_for(resp)
    return resp.json()


def refresh_access_token(client_id, client_secret, refresh_token):
    resp = requests.post(TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=TIMEOUT)
    _raise_for(resp)
    return resp.json()


def revoke(token):
    try:
        requests.post(REVOKE_URL, data={"token": token}, timeout=TIMEOUT)
    except requests.RequestException:
        pass


def userinfo(access_token):
    resp = requests.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=TIMEOUT)
    _raise_for(resp)
    return resp.json()


def yt_get(path, access_token, **params):
    resp = requests.get(
        YT_API + path,
        params=params,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=TIMEOUT,
    )
    _raise_for(resp)
    return resp.json()
