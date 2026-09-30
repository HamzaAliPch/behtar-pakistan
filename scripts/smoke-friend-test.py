"""Exercise the isolated production server with test-only credentials."""

import base64
import http.client
import re
import secrets
import sqlite3
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime" / "friend-test"
DB = ROOT / "prisma" / "friend-test.db"
HOST = "127.0.0.1"
PORT = 3101


def request(method, path, body=None, headers=None):
    connection = http.client.HTTPConnection(HOST, PORT, timeout=20)
    connection.request(method, path, body=body, headers={"Host": f"{HOST}:{PORT}", **(headers or {})})
    response = connection.getresponse()
    content = response.read()
    result = response.status, dict(response.getheaders()), content
    connection.close()
    return result


def form(parts):
    boundary = "----BehtarSmoke" + secrets.token_hex(12)
    body = bytearray()
    for name, value, mime in parts:
        body += f"--{boundary}\r\n".encode()
        if mime:
            body += f'Content-Disposition: form-data; name="{name}"; filename="test.png"\r\nContent-Type: {mime}\r\n\r\n'.encode()
            body += value
        else:
            body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}'.encode()
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print("PASS", message)


def main():
    contents = (RUNTIME / "credentials.txt").read_text()
    email = re.search(r"^Email: (.+)$", contents, re.M).group(1)
    password = re.search(r"^Password: (.+)$", contents, re.M).group(1)
    sample_reference = re.search(r"^Sample reference: (.+)$", contents, re.M).group(1)

    status, _, page = request("GET", "/login")
    check(status == 200 and b"Log in" in page, "isolated login page")
    action = re.search(rb'name="(\$ACTION_ID_[a-f0-9]+)"', page).group(1).decode()
    body, content_type = form([(action, "", None), ("next", "", None), ("email", email, None), ("password", password, None)])
    status, headers, _ = request("POST", "/login", body, {"Content-Type": content_type, "Origin": f"http://{HOST}:{PORT}"})
    set_cookie = headers.get("Set-Cookie", "")
    check(status in (302, 303) and headers.get("Location") == "/dashboard", f"test citizen login (status {status}, redirect {headers.get('Location')})")
    check("__Host-kfx_session=" in set_cookie and "secure" in set_cookie.lower() and "httponly" in set_cookie.lower() and "samesite=lax" in set_cookie.lower(), "secure production session cookie")
    cookie = set_cookie.split(";", 1)[0]

    status, _, dashboard = request("GET", "/dashboard", headers={"Cookie": cookie})
    check(status == 200 and sample_reference.encode() in dashboard, "citizen dashboard owns sample report")
    status, _, report_page = request("GET", "/report", headers={"Cookie": cookie})
    check(status == 200 and b"Report an issue" in report_page, "authenticated reporting form")

    status, headers, _ = request("GET", "/admin", headers={"Cookie": cookie})
    check(status in (302, 303, 307, 308) and not headers.get("Location", "").startswith("/admin"), f"citizen cannot open admin dashboard (status {status}, redirect {headers.get('Location')})")

    status, _, public_tracking = request("GET", "/track?ref=" + quote(sample_reference))
    check(status == 200 and b"Private case details require" in public_tracking and b"fictional street drain issue" not in public_tracking, "public tracking hides private case details")

    # A single pixel test image is created in memory and stored only in the isolated upload directory.
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=")
    submission_key = "-".join((secrets.token_hex(4), secrets.token_hex(2), secrets.token_hex(2), secrets.token_hex(2), secrets.token_hex(6)))
    values = {"citySlug": "karachi", "submissionKey": submission_key, "title": "TEST DATA: blocked street drain", "category": "Water & drainage", "description": "This is a fictional test report for isolated friend testing.", "district": "East", "area": "Gulshan-e-Iqbal", "manualArea": "0", "streetOrBlock": "", "landmark": "", "privateDirections": "", "latitude": "", "longitude": ""}
    body, content_type = form([(key, value, None) for key, value in values.items()] + [("photos", png, "image/png")])
    import json
    status, _, response = request("POST", "/api/reports", body, {"Content-Type": content_type, "Origin": f"http://{HOST}:{PORT}", "Cookie": cookie})
    result = json.loads(response)
    check(status == 201 and result.get("reference", "").startswith("KFX-"), "report submitted with photo")
    status, _, response = request("POST", "/api/reports", body, {"Content-Type": content_type, "Origin": f"http://{HOST}:{PORT}", "Cookie": cookie})
    check(status == 200 and json.loads(response).get("duplicate") is True, "repeat submission does not create duplicate")
    status, _, owned_tracking = request("GET", "/track?ref=" + quote(result["reference"]), headers={"Cookie": cookie})
    check(status == 200 and b"blocked street drain" in owned_tracking, "owner sees submitted report in tracking")

    db = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    evidence_id, key = db.execute('SELECT "id", "storageKey" FROM "Evidence" WHERE "complaintId"=?', (result["id"],)).fetchone()
    db.close()
    check((RUNTIME / "uploads" / key).is_file(), "report photo stored in isolated upload directory")
    status, _, _ = request("GET", "/api/evidence/" + quote(evidence_id))
    check(status in (401, 403, 404), "private image cannot be read anonymously")
    status, _, _ = request("GET", "/api/evidence/" + quote(evidence_id), headers={"Cookie": cookie})
    check(status == 200, "report owner can read own image")

    status, _, _ = request("GET", "/", headers={"Host": "socialautomation.my.id"})
    check(status == 421, "main domain rejected by test service")
    status, _, _ = request("GET", "/", headers={"Host": "test.socialautomation.my.id", "X-Forwarded-Proto": "https"})
    check(status == 200, "exact external test hostname accepted")
    status, _, _ = request("POST", "/api/reports", b"", {"Host": "test.socialautomation.my.id", "Origin": "https://test.socialautomation.my.id", "Cookie": cookie})
    check(status == 415, "HTTPS test hostname origin passes CSRF gate")
    status, _, _ = request("POST", "/api/reports", b"", {"Host": "test.socialautomation.my.id", "Cookie": cookie})
    check(status == 403, "remote form without Origin is rejected")
    status, _, _ = request("POST", "/api/reports", body, {"Content-Type": content_type, "Origin": "https://evil.example", "Cookie": cookie})
    check(status == 403, "cross-origin report submission rejected")
    print("Friend-test HTTP smoke checks passed. No real credentials or main records used.")


if __name__ == "__main__":
    main()
