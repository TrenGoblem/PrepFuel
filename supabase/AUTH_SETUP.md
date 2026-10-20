# Fuelr Auth / Launch Setup

The Fuelr Supabase project is live and the app is connected with the browser-safe publishable key.

## Supabase project

- Project: Fuelr
- Region: us-east-1
- Project ref: `svzhkxqjeclrlygzcxdj`
- API URL: `https://svzhkxqjeclrlygzcxdj.supabase.co`

## Email/password auth

Email/password auth is enabled by default on hosted Supabase projects.

For a polished confirmation flow, set these in Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://trengoblem.github.io/PrepFuel/`
- **Redirect URL:** `https://trengoblem.github.io/PrepFuel/**`

Until this is changed, email confirmation can still verify the account, but Supabase's default post-confirmation redirect may point to localhost.

## Google / Apple later

Google and Apple require external OAuth credentials before their providers can be enabled. Do not commit OAuth secrets to this repository.

## Client-side credentials

Only the Supabase **publishable** key belongs in `assets/cloud-config.js`.
Never add the service-role key to browser code or GitHub.

## Live cloud features

- account creation and sign-in
- per-user profile
- college theme
- budget and store settings
- food preferences and allergies
- private personal recipes
- private recipe image storage
- 7/14 weekly plans
- grocery completion
- prep completion
- multi-device cloud state
- local-to-cloud migration for users who started before accounts
