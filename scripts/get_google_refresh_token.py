from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/tasks.readonly",
]

CLIENT_FILE = Path("client_secret.json" )

flow = InstalledAppFlow.from_client_secrets_file(
    CLIENT_FILE,
    scopes=SCOPES,
)

credentials = flow.run_local_server(
    port=0,
    access_type="offline",
    prompt="consent",
)

print("Refresh token:")
print(credentials.refresh_token)
