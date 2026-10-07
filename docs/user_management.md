# User Management

TokTagger supports many users at the same time. An **identity provider** keeps the accounts and the passwords. TokTagger does not store passwords. TokTagger keeps the project roles and the annotations.

---

## Identity Providers

TokTagger signs users in with OpenID Connect. Set `auth.provider` to choose the identity provider.

| `auth.provider` | Who runs the identity provider | Use it for |
|---|---|---|
| `canaille` (default) | TokTagger starts a local [Canaille](https://canaille.readthedocs.io) server for you | A laptop or a small team. `pip install toktagger` is all you need. |
| `oidc` | You. Use Keycloak, Microsoft Entra ID, or your organisation single sign-on | A shared server, or a Docker deployment |

Both modes use the same sign-in flow. In `canaille` mode, TokTagger also creates and starts the identity provider.

!!! warning
    Use TLS (HTTPS) for every deployment that is not on `localhost`. This applies to all providers. Without TLS, passwords and session cookies cross the network in plain text.

---

## User Roles

TokTagger has two layers of roles.

### Global roles (account-level)

| Global Role | Permissions |
|---|---|
| `admin` | Full access: create, edit and delete any project, manage user accounts, view all annotations |
| `user` | Access only to projects the user is a member of |

The identity provider sets the global role. A user is an `admin` when the user belongs to the group `toktagger-admins`. TokTagger reads the groups again at every sign-in. To change a global role, change the group membership in the identity provider.

### Project roles (per-project membership)

| Project Role | Permissions |
|---|---|
| `admin` | Manage project membership, add and delete samples, and do everything an `annotator` can do |
| `annotator` | Submit, update and delete annotations for the project samples |
| `viewer` | Read-only access to the project samples and annotations |

The project configuration decides which samples a project contains. Only a project admin can add or delete samples. In the UI, the **Add Samples**, **Clear Samples** and per-row **Delete** buttons are grey for annotators and viewers.

A global `admin` has full access to all projects, whatever the project role is.

---

## First Start With Canaille

On the first start, TokTagger creates the local identity provider. It prints the address and the password of the first administrator:

```
First start: a local identity provider (Canaille) was created.
  Address:  http://localhost:8003
  Username: admin
  Password: <random password>
Change the password at http://localhost:8003/profile/admin
```

TokTagger prints the password one time only. Write it down. Then open the address and change the password.

TokTagger keeps the Canaille data in the `canaille` folder of the server `cache_dir`. A restart uses the same data and prints no password.

!!! note
    Canaille sends no email unless you configure it. Password reset emails are not available. An administrator sets a new password in the Canaille user pages.

### Add a user

1. Sign in to Canaille at `http://localhost:8003` as `admin`.
2. Open **Users** and click **Add a user**.
3. Enter the user name, the email address and a password.
4. To make the user a TokTagger admin, add the user to the group `toktagger-admins`.

The user can now sign in to TokTagger.

---

## Signing In

Open `http://<host>:<port>/ui/login` (or the root URL). Click **Sign in**. The identity provider shows its sign-in page. After you sign in, you return to TokTagger.

TokTagger creates its own record for a user at the first sign-in. The record contains the user name, the email address and the display name. TokTagger takes the user name from the identity provider claim `preferred_username`. If that name is already in use, TokTagger adds a number. TokTagger never changes a user name after the first sign-in, because annotations store it.

!!! note
    A user does not appear in the TokTagger user list or in the project member list until the first sign-in.

To sign out, use **Sign out** in TokTagger. TokTagger then opens the sign-out page of the identity provider.

---

## Admin Panel

The admin panel is on the **Admin Panel** button on the Projects page. Only admin users see it.

### Viewing Users

The panel lists all users that signed in at least one time. It shows the user name, the email address, the global role and the active status.

TokTagger shows the global role as read-only. Change it in the identity provider.

### Deactivating and Reactivating a User

Click **Deactivate** (or **Activate**) next to the user. A deactivated user cannot use TokTagger. The identity provider cannot override this setting. TokTagger keeps the annotations of the user. You cannot deactivate your own account. You cannot deactivate the last active admin.

### Deleting a User

Click **Delete** next to the user and confirm. This deletes the TokTagger record and the project memberships of the user. It does not delete the account in the identity provider. The user can sign in again and TokTagger creates a new record. You cannot delete the last active admin.

---

## Profile Page

Each signed-in user can open **Profile** from the Projects page. The page shows the user name, the email address and the display name. Click **Manage account** to change the password or other account data in the identity provider.

---

## Project Membership

Access to a project is set for each project. On the project Samples page, an admin clicks **Members** to add or remove users.

Only members and admins can view samples and submit annotations. If you open the URL of a project you are not a member of, the page shows **403 - Forbidden**. Ask a project admin to add you.

---

## Use Keycloak or Another Identity Provider

Set `auth.provider` to `oidc` and give TokTagger the details of your provider:

```toml
[auth]
provider = "oidc"
issuer_url = "https://auth.example.com/realms/toktagger"
client_id = "toktagger"
client_secret = "<client secret>"
public_url = "https://toktagger.example.com"
roles_claim = "groups"
admin_group = "toktagger-admins"
```

In the identity provider, create a **confidential** client for TokTagger. Use this checklist:

1. **Flow:** Enable the authorization code flow with PKCE (method `S256`). Disable the other flows.
2. **Redirect URI:** Set `<public_url>/auth/callback`.
3. **Sign-out redirect URI:** Set `<public_url>/ui/login`.
4. **Groups claim:** Add a mapper that puts the groups of the user in the ID token, the access token and the userinfo. Set `roles_claim` to the name of the claim. For a nested claim, use a dotted path, for example `realm_access.roles`.
5. **Admin group:** Create the group named in `admin_group`. Add the TokTagger admins to it. TokTagger removes a leading `/` from group names.
6. **Audience:** Add the client ID to the audience of access tokens. TokTagger needs this to accept access tokens from scripts.

!!! note
    TokTagger must reach the provider at the issuer URL, and the issuer in the provider metadata must match the URL the browser uses. If the two differ, set the provider hostname options. The Keycloak development stack in `docker-compose.dev.yml` shows how to do this.

### Keycloak development stack

`docker-compose.dev.yml` starts Keycloak with a ready realm from `deploy/keycloak/toktagger-realm.dev.json`. The realm contains:

- the client `toktagger`, with PKCE and the group and audience mappers
- the group `toktagger-admins`
- one user `admin` with the temporary password `admin`, who is a member of `toktagger-admins`

Start the stack:

```sh
docker compose -f docker-compose.dev.yml up
```

Open `http://localhost:5173` or `http://localhost:8002` and sign in as `admin`. Keycloak asks for a new password. The Keycloak administration console is at `http://localhost:8080` (user `admin`, password `admin`).

Set `KEYCLOAK_CLIENT_SECRET` in your environment to replace the default development client secret.

!!! warning
    The development stack uses fixed passwords and plain HTTP. Do not use it for a shared server.

---

## Scripts

A script can call the API with a Bearer token. Send the **access token** of the identity provider in the header `Authorization: Bearer <token>`. TokTagger checks the signature, the issuer, the expiry and the audience of the token. It then uses the same rules as for a browser user.

The scripts `scripts/setup.py` and `scripts/create_mock_data.py` read the token from the environment variable `TOKTAGGER_API_TOKEN`:

```sh
TOKTAGGER_API_TOKEN=<access token> python scripts/setup.py
```

---

## Multi-User Deployment

For team use, run the API under **Gunicorn**. Then the server can serve many requests at the same time:

```sh
# Command-line (installed package)
toktagger --workers 4 --host 0.0.0.0 --port 8002
```

Use the `toktagger` command or `python -m toktagger.api.run` for Gunicorn. These commands start the identity provider and the shared services one time, before the workers start. Do not start `toktagger.api.asgi:app` directly with `auth.provider = "canaille"`.

Set `AUTH_SECRET_KEY` so that all workers sign sessions with the same key.

A single Uvicorn worker (the default) is enough for personal use. It handles one request at a time, so many annotators will see delays.
