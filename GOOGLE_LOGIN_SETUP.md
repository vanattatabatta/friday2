# Turn on "Continue with Google" (Gmail login + sign-up)

The button is already on the Login and Sign-up pages. It stays a grey placeholder until the server knows your Google client ID.

1. Go to https://console.cloud.google.com/apis/credentials -> Create credentials -> OAuth client ID -> Web application.
2. Under "Authorized JavaScript origins" add every address the site is opened on, for example:
   - https://mobileai.up.railway.app
   - your own domain (https://yourdomain.com and https://www.yourdomain.com)
   (No redirect URI is needed: the button uses the popup / ID-token flow.)
3. Copy the Client ID (ends with .apps.googleusercontent.com).
4. In Railway -> your service -> Variables add:  GOOGLE_CLIENT_ID=<that client id>   then redeploy.
5. Open /signup: the real Google button appears. Picking a Gmail account creates the account (or logs in if the email already exists).

Optional: GOOGLE_ALLOWED_DOMAINS=gmail.com  (only Gmail accounts allowed).

# Sign-up email
Sign-up no longer waits for the confirmation email, so it works even if mail is not set up. To actually deliver the email on Railway (SMTP is blocked on Free/Hobby) use MAIL_PROVIDER=relay or RESEND_API_KEY, see backend/.env.example.
