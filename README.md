# Gather

A responsive recipe planner for family dinners, holidays, and the meals in between.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.

The starter cookbook saves to this browser with `localStorage`, so it works without creating an account or configuring a backend.

## Supabase Auth and security

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and fill in the project URL and publishable key (or legacy anon key). Never put a service-role key in the browser app.
3. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. If you ran an earlier version, run it again to replace the policies with the optional, per-account MFA policy.
4. In **Authentication → Sign In / Providers → Email**, enable email signups and leave email confirmation and secure email-change confirmations enabled.
5. While developing locally, set Site URL to `http://localhost:5173/` and add that URL to the redirect URL allowlist. When GitHub Pages is configured later, change the Site URL to the Pages URL and add it to the allowlist too. Confirmation, magic-link, and recovery email links return to the app base path automatically.
6. In Gather, create an account or sign in. MFA is optional. If a user enables an authenticator factor, Gather prompts for its code at subsequent sign-ins and database policies require an AAL2 session for that account.

### Email delivery

Supabase's built-in mailer is suitable for trying the flows with project team addresses, but is heavily limited and isn't for a public launch. Configure a custom SMTP sender in **Authentication → Emails / SMTP Settings** before inviting general users. Add the SMTP host, port, credentials, sender address, and sender name from your provider. Configure SPF, DKIM, and DMARC records with that provider. Keep the confirmation and password-recovery templates enabled; if editing templates, retain Supabase's confirmation URL/token variables and redirect behavior.

### Google sign-in

In Google Cloud, create a web OAuth client. Add your local site origin (`http://localhost:5173`) as an authorized JavaScript origin. Once GitHub Pages is set up, add its origin (`https://OWNER.github.io`) too. For the authorized redirect URI, copy the callback URL shown on the Supabase Google provider page; it is typically `https://PROJECT_REF.supabase.co/auth/v1/callback`. Then enable Google under **Authentication → Sign In / Providers → Google** and enter the client ID and secret there. Keep the Google client secret in Supabase only, never in Vite or GitHub Actions. Add the matching app URLs to Supabase's redirect allowlist. The app asks only for standard profile and email sign-in.

### Multifactor authentication

MFA is optional. Under **Authentication → Multi-Factor Authentication**, enable TOTP enrollment and verification if you want users to be able to add an authenticator app. The account screen lets users add or remove an authenticator. If a factor is enrolled, sign-in requires a code and the RLS policy checks for AAL2. Gather does not offer SMS MFA enrollment. Disable Phone enrollment and verification in Supabase; if any phone factor was enrolled earlier, remove it in Gather first so its user can still complete MFA. The app supports one-time backup codes and shows generated codes once, so users should store them privately. Supabase currently marks passkeys and its recovery-code API as experimental.

### Rate limits and attack protection

In **Authentication → Settings → Security and Protection** (menu wording can vary), keep the built-in Auth rate limits enabled and avoid raising them without a reason. Gather does not use SMS sign-in; leave phone/SMS providers disabled unless you later choose to support them. Supabase CAPTCHA supports Cloudflare Turnstile: create a Turnstile site, add the Pages hostname (and localhost for development) to its hostnames, enable CAPTCHA in Supabase Bot and Abuse Protection, select Turnstile, and paste the Turnstile **secret key** into Supabase. Add the Turnstile **site key** as `VITE_TURNSTILE_SITE_KEY` in the local `.env` and GitHub Actions Variables. The site key is public; the secret stays only in Supabase. If CAPTCHA is enabled in Supabase, set the site key before using email/password, magic-link, or password-reset forms.

Under **Authentication → Password Security**, set a minimum of at least 12 characters, require a mix of uppercase, lowercase, numbers, and symbols, and enable **Require current password when changing password**. The signed-in **Change password** form sends the current password with the update. You can also enable **Require reauthentication when changing password**; if Supabase asks for it, Gather sends a verification-code request and requires the code from the user's confirmed email together with the current password. Keep the reauthentication email template enabled. **Forgot password?** remains a separate email-recovery flow; users who no longer know their old password use the secure reset link instead, and enrolled MFA is verified before the reset form opens. Leaked-password protection is Pro-only. Keep email confirmations and security notification emails enabled, use custom SMTP for real users, and configure SPF, DKIM, and DMARC. Supabase's built-in mailer is testing-only with recipient and rate limits.

### Passkeys (optional)

Passkeys are an experimental Supabase Auth feature and require `@supabase/supabase-js` 2.105 or newer. In **Authentication → Passkeys**, enable passkeys and set the relying party display name (for example, `Gather`). For GitHub Pages, use the Pages hostname as the relying party ID (for example, `OWNER.github.io`) and add the origin `https://OWNER.github.io` (origins have no repository path). Users must first sign in with a confirmed account, then choose **Add a passkey** in **Account & sync**. Passkey sign-in is then available at the sign-in screen. `localhost` cannot be an origin under a `github.io` relying party ID; for local passkey testing, temporarily use RP ID `localhost` and origin `http://localhost:5173`, then switch back before production enrollment. Changing the RP ID invalidates passkeys enrolled under the old ID. A custom domain gives stronger origin separation than the shared `github.io` host.

If you customize Supabase's confirmation or recovery email templates, use the redirect destination (`{{ .RedirectTo }}`) for the callback when the app supplies `redirectTo`; Supabase's default templates already handle the flow.

The SQL enables row-level security, denies anonymous access, and limits signed-in users to their own row. It requires AAL2 only for accounts that have a verified MFA factor; accounts without one can continue using their cookbook without MFA. The first sign-in merges the device cookbook with that account's cloud cookbook. Without project credentials, Gather continues to save locally on the current device.

## GitHub Pages

This project includes a GitHub Actions workflow at `.github/workflows/deploy.yml`. It builds the Vite app with the repository subpath automatically, then deploys `dist/` to Pages.

1. Create a GitHub repository and push this project to its `main` branch. This workspace is not connected to a Git repository yet.
2. In the repository's **Settings → Pages**, choose **GitHub Actions** as the publishing source.
3. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and either `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`. Add `VITE_TURNSTILE_SITE_KEY` if CAPTCHA is enabled. These client values are browser-visible; never use a Supabase service-role key, Google OAuth secret, SMTP password, or CAPTCHA secret here.
4. After the first deployment, set the Supabase Auth Site URL to the Pages URL (for example, `https://OWNER.github.io/REPOSITORY/`) and add that exact URL to the allowed redirect URLs. Keep `http://localhost:5173/` there for local development.

For a user or organization site whose repository is named `OWNER.github.io`, GitHub Pages uses the root URL `https://OWNER.github.io/` instead.

## Recipe AI

The interface has clearly marked placeholders for recipe suggestions and recipe refinements. An AI provider and server-side endpoint can be connected later without exposing an API secret in the browser.
