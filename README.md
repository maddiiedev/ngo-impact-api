# NGO Impact API

A REST API for an NGO donation and volunteer management platform. People can find and create NGOs, run campaigns and fundraisers, record donations with proof of payment, and organise volunteers through opportunities, applications and shifts.

The API does **not** process payments. Donors pay the NGO or fundraiser directly (for example by bank transfer), then upload the receipt. The receiver checks it and confirms or rejects it, and only confirmed donations count towards the amount raised.

## Features

- **Accounts:** register, login, refresh tokens, password reset, profile update, password change, account deactivation
- **NGOs:** create an NGO and manage members with owner, admin and member roles, and transfer ownership
- **Campaigns:** official fundraising drives run by an NGO
- **Fundraisers:** personal fundraisers, or fundraisers linked to an NGO
- **Donations:** receipt upload (stored privately on Cloudinary), confirm or reject, public donor wall, donor can withdraw a pending donation
- **Volunteering:** opportunities posted by NGOs, applications and review, shifts with sign-up, attendance and hours tracking
- **Dashboard:** one call for the home screen
- **Security:** JWT access and refresh tokens, bcrypt password hashing, rate limiting, input validation, helmet, CORS

## Tech stack

Node.js, Express, MongoDB with Mongoose, JSON Web Tokens, bcryptjs, Cloudinary, multer, express-rate-limit, helmet, cors, morgan.

## Project structure

```
server.js                  connects to MongoDB, then starts the app
src/
  app.js                   middleware, routes, error handling
  config/                  env.js, db.js, cloudinary.js
  controllers/             request handling for each area
  middleware/              auth.js, ngoRole.js, upload.js, rateLimiters.js, errorHandler.js
  models/                  User, NGO, Campaign, Fundraiser, Donation,
                           Opportunity, Application, Shift
  routes/                  one file per area, mounted in index.js
  utils/                   validators, receipts, access helpers, shared helpers
```
## Endpoints

"Login" means a valid access token is required. "Manager" means owner or admin of the NGO involved.

```
GENERAL
GET     /                                        public, health check

AUTH
POST    /api/auth/register                       public
POST    /api/auth/login                          public
POST    /api/auth/refresh                        public
POST    /api/auth/logout                         login
POST    /api/auth/forgot-password                public
POST    /api/auth/reset-password                 public

ACCOUNT
GET     /api/me                                  login
PATCH   /api/me                                  login, update name or phone
PATCH   /api/me/password                         login, change password
POST    /api/me/deactivate                       login, deactivate account
GET     /api/dashboard                           login

NGOS (all login)
GET     /api/ngos                                ?search= &category=
POST    /api/ngos
GET     /api/ngos/:id
PATCH   /api/ngos/:id                            manager
POST    /api/ngos/:id/members                    manager (only the owner adds admins)
PATCH   /api/ngos/:id/members/:userId            owner
DELETE  /api/ngos/:id/members/:userId            member (leave), manager (remove)
POST    /api/ngos/:id/transfer-ownership         owner
GET     /api/ngos/:id/campaigns
POST    /api/ngos/:ngoId/campaigns               manager
GET     /api/ngos/:id/opportunities              managers also see drafts
POST    /api/ngos/:ngoId/opportunities           manager

CAMPAIGNS
GET     /api/campaigns                           public, ?search= &category= &status= &ngo=
GET     /api/campaigns/:id                       public
PATCH   /api/campaigns/:id                       manager of its NGO
PATCH   /api/campaigns/:id/status                manager of its NGO
DELETE  /api/campaigns/:id                       manager of its NGO, blocked once it has donations
GET     /api/campaigns/:id/donations             public, confirmed donations
POST    /api/campaigns/:id/donations             login, multipart form with receipt

FUNDRAISERS
GET     /api/fundraisers/mine                    login, includes drafts
GET     /api/fundraisers                         public, ?search= &category= &status= &ngo=
GET     /api/fundraisers/:id                     public
POST    /api/fundraisers                         login
PATCH   /api/fundraisers/:id                     creator, or manager of its NGO
DELETE  /api/fundraisers/:id                     creator, or manager of its NGO, blocked once it has donations
GET     /api/fundraisers/:id/donations           public, confirmed donations
POST    /api/fundraisers/:id/donations           login, multipart form with receipt

DONATIONS (all login)
GET     /api/donations/mine                      ?status=
GET     /api/donations/received                  donations waiting for you, ?status= (default pending)
GET     /api/donations/:id                       the donor or a receiver
GET     /api/donations/:id/receipt               the donor or a receiver, returns a 5-minute link
PATCH   /api/donations/:id/confirm               a receiver
PATCH   /api/donations/:id/reject                a receiver
DELETE  /api/donations/:id                       the donor, while still pending

OPPORTUNITIES
GET     /api/opportunities                       public, ?search= &category= &ngo= &skill= &remote=true
GET     /api/opportunities/:id                   public
PATCH   /api/opportunities/:id                   manager
PATCH   /api/opportunities/:id/status            manager
DELETE  /api/opportunities/:id                   manager, blocked once it has applications or shifts
GET     /api/opportunities/:id/shifts            public, ?when=upcoming|past|all
POST    /api/opportunities/:id/shifts            manager
POST    /api/opportunities/:id/applications      login, apply
GET     /api/opportunities/:id/applications      manager, ?status=

APPLICATIONS (all login)
GET     /api/applications/mine                   ?status=
GET     /api/applications/:id                    the volunteer or a manager
PATCH   /api/applications/:id/accept             manager
PATCH   /api/applications/:id/reject             manager
PATCH   /api/applications/:id/withdraw           the volunteer

SHIFTS (all login)
GET     /api/shifts/mine                         ?when=upcoming|past|all, includes total hours
GET     /api/shifts/:id                          managers also see who signed up
PATCH   /api/shifts/:id                          manager
PATCH   /api/shifts/:id/status                   manager, completed or cancelled
DELETE  /api/shifts/:id                          manager, only with no sign-ups
POST    /api/shifts/:id/join                     volunteer with an accepted application
DELETE  /api/shifts/:id/join                     leave a shift before it starts
PATCH   /api/shifts/:id/attendance               manager, mark attended or absent