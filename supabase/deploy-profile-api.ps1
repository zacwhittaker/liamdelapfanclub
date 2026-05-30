# Deploy get-profile Edge Function + secrets to Supabase
# Run from the "LDFC website" folder in PowerShell:
#   cd "C:\Users\lifeo\Documents\LDFC website"
#   .\supabase\deploy-profile-api.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== LDFC profile API — Supabase deploy ===" -ForegroundColor Cyan
Write-Host ""

$projectRef = "yksrdnlefshmsdygiqxo"
$botUrl = "https://worker-production-9afb.up.railway.app"
$guildId = "1464771608781783191"

Write-Host "Project: $projectRef"
Write-Host "Bot URL: $botUrl"
Write-Host ""

$token = Read-Host "Paste BOT_PROFILE_API_TOKEN (hidden)" -AsSecureString
$tokenPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
)

if ([string]::IsNullOrWhiteSpace($tokenPlain)) {
  Write-Host "No token entered. Exiting." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Step 1: Login to Supabase (browser will open)..." -ForegroundColor Yellow
npx supabase login

Write-Host ""
Write-Host "Step 2: Link project..." -ForegroundColor Yellow
npx supabase link --project-ref $projectRef

Write-Host ""
Write-Host "Step 3: Set secrets..." -ForegroundColor Yellow
npx supabase secrets set "BOT_PROFILE_API_URL=$botUrl"
npx supabase secrets set "BOT_PROFILE_API_TOKEN=$tokenPlain"
npx supabase secrets set "LDFC_GUILD_ID=$guildId"

Write-Host ""
Write-Host "Step 4: Deploy get-profile function..." -ForegroundColor Yellow
npx supabase functions deploy get-profile --project-ref $projectRef

Write-Host ""
Write-Host "Done! Open https://www.ldfc.co.uk/profile/ and log in." -ForegroundColor Green
Write-Host "The function timestamp in Supabase should update to now." -ForegroundColor Green
Write-Host ""
