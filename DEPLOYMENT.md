# Deploy Sahva on AWS

Use Node 22, PostgreSQL 16 and one running Sahva server. Both WebSocket endpoints use that process for live connections and Gemini sessions. Postgres holds the call state and user data. Multiple app replicas require a shared signaling transport and room routing before scaling out.

## AWS resources

1. For the sahva-demo deployment, use the EC2-hosted database instructions below. For managed PostgreSQL, create an RDS PostgreSQL 16 instance in private subnets with encryption and automated backups. Permit TCP 5432 from the app security group. Create a database and login for Sahva. Set DATABASE_URL, URL-encoding password characters. Install the AWS RDS CA bundle in the container trust store or mount it with NODE_EXTRA_CA_CERTS. Use sslmode=verify-full for certificate and hostname validation.
2. Create a private, encrypted S3 bucket in the app region with Block Public Access enabled. Grant the EC2 instance profile or ECS task role s3:GetObject and s3:PutObject on recordings/*, voice-notes/*, note-audio/* and avatars/* in that bucket. Configure KMS permissions too if using your own KMS key. Playback uses 15-minute presigned requests.
3. Configure bucket CORS. Substitute your origin below. Add a separate rule or origin for local web development as needed.

```json
[{"AllowedOrigins":["https://sahva.example.com","https://localhost"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["Range"],"ExposeHeaders":["Accept-Ranges","Content-Range","Content-Length","Content-Disposition"],"MaxAgeSeconds":3600}]
```

## Clerk and Gemini

Use the existing Clerk application selected for Sahva. React uses @clerk/clerk-react 5. Express checks session JWTs and provisions users from verified Clerk email addresses. Enable Google and passwordless email verification codes in Clerk and disable password requirements. Configure both new and returning users, including the transferable sign-up flow. Authorize the public website and Capacitor origin https://localhost. Register the website SSO completion route /sso-callback. Configure the app scheme sahva://oauth-callback and your verified HTTPS /oauth-callback link. In Google Cloud use the exact OAuth redirect supplied by Clerk.

The APK opens the hosted /native-login page in a Chrome Custom Tab. Clerk completes Google OAuth there. The page returns a 60-second single-use sign-in ticket encrypted to the requesting WebView's temporary public key. The APK checks state and decrypts the ticket before activating its own Clerk session. Hosting the same public web and API origin simplifies deployment. Ensure Clerk permits this WebView origin for the instance you deploy.

Set GEMINI_API_KEY on the server and enable the Gemini Live and TTS models used by your deployment. Keep AWS credentials, the Clerk secret and internal ringing key in Secrets Manager or restricted host environment variables.

## Sahva and PostgreSQL on sahva-demo

The deployment target is `sahva.madsoul.in` on `i-0b94d7413ad249aa4` in `us-west-2a`. Check free RAM and disk, the EBS encryption and deletion settings, and the processes already using ports 80 and 443 before starting. Keep TCP 5432 closed in the instance security group. Media uses the private S3 bucket in Oregon.

1. Install Docker Engine, Compose v2 and Certbot. Prepare a mode-600 `.env` in the checkout root with the application settings from the next section. Set `PUBLIC_WEB_URL=https://sahva.madsoul.in` and `AWS_REGION=us-west-2`. The database overlay sets DATABASE_URL for both the migration and application containers. Keep database credentials in a separate mode-600 `.env.postgres` for Compose interpolation. For the first installation on an empty database volume, generate the credentials once.

```sh
(umask 077; set -C; { echo "POSTGRES_ADMIN_PASSWORD=$(openssl rand -hex 32)"; echo "SAHVA_DB_PASSWORD=$(openssl rand -hex 32)"; } > .env.postgres)
docker volume create sahva-postgres16
```

2. With port 80 available, request the certificate using the command below. If another reverse proxy already serves this host, issue the certificate through that proxy and integrate the Sahva virtual host there. Obtain the first certificate before starting the bundled TLS proxy.

```sh
sudo certbot certonly --standalone --cert-name sahva -d sahva.madsoul.in
sudo mkdir -p /var/www/certbot
compose() { docker compose --env-file .env.postgres -f deploy/docker-compose.prod.yml -f deploy/docker-compose.ec2-postgres.yml "$@"; }
compose up --build -d
compose ps -a
compose exec -T postgres psql -U postgres -d sahva -c '\dt public.*'
curl --fail https://sahva.madsoul.in/healthz
```

The app waits for the migrations to finish. Docker keeps PostgreSQL on an internal network and stores the cluster in the external volume. The application connects as the database owner with no cluster administration privileges. Keep the volume on encrypted EBS and configure TLS renewal. Changing the password file after initialization also requires rotating the corresponding PostgreSQL role credentials.

3. Schedule encrypted EBS snapshots or database backups outside this instance before storing production data. For a logical backup, run the following from the same shell, copy the archive to restricted off-instance storage, and test a restore on a separate PostgreSQL 16 database with the Sahva role and migrations schema included. Restore the original database credentials from secure storage when rebuilding the host.

```sh
(umask 077; compose exec -T postgres pg_dump -U postgres -d sahva -Fc > "sahva-$(date -u +%Y%m%dT%H%M%SZ).dump")
```

## Single EC2 instance with RDS

1. Point your domain's DNS at the EC2 instance. Permit inbound 80 and 443 and restrict administration access. Install Docker Engine, Docker Compose v2 and Certbot.
2. Copy .env.example to .env on the host, set NODE_ENV=production, PUBLIC_WEB_URL to the HTTPS website origin, VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, GEMINI_API_KEY, DATABASE_URL, AWS_REGION, AWS_S3_BUCKET and a randomly generated INTERNAL_CALL_API_KEY. Restrict permissions on .env. The website obtains its publishable key from /public-config if the key was omitted at build time.
3. Obtain a certificate before starting Nginx on port 80. The configuration looks for a certificate named sahva.

```sh
sudo certbot certonly --standalone --cert-name sahva -d sahva.example.com
sudo mkdir -p /var/www/certbot
docker compose -f deploy/docker-compose.prod.yml up --build -d
curl --fail https://sahva.example.com/healthz
```

Compose runs the checked-in migration once before making the application available. Review database migrations before rollout and take an RDS snapshot before schema changes. Configure renewal through the webroot /var/www/certbot and reload Nginx after successful renewal. Verify renewal with certbot renew --dry-run. The proxy permits 50 MB bodies, preserves WebSocket upgrades, and forwards SPA routes to Express.

## ECS Fargate

Build from the project root with docker build -f deploy/Dockerfile. Push the image to ECR. Use an ECS task role for S3 and an execution role for image pulls and Secrets Manager. Run a one-off task using node dist-server/migrate.js with the app's networking and secrets, and check for exit zero. Start one app task on port 3000 in private subnets. Terminate TLS on an Application Load Balancer using ACM, forward HTTP/1.1 to the target group, check /healthz and allow the ALB security group to reach 3000. Set an idle timeout longer than the 20-second heartbeat. Drain calls before replacing the task. Use the Node container as the ALB target. Ensure its subnets have egress to Clerk and Gemini and access to S3 and RDS.

## Acceptance

Sign in as two different verified users and complete onboarding. Search for the other account, send text and voice messages, reload, then call while both a desktop tab and the APK are connected as the recipient. Answer on one device and confirm the other stops ringing. Speak in each direction, verify translated playback and original voice level, then end the call. Reload the call log, open its notes, seek and download the WAV, check and archive a task, and sign in on the other device to check persistence. Use ANDROID_TEST_APK.md for device and internal API tests.

