St. Andrew Carpool Board

Run it:   node server.js        then open http://localhost:8080
Needs:    Node 18 or newer. No other installs.
Data:     data.json (created automatically). Delete a record there to remove a listing.

Files:    server.js (API + file server), public/index.html (the whole front end)
API:      GET /api/drivers   POST /api/drivers   DELETE /api/drivers/:id?token=...
Behavior: expired dates disappear automatically; drivers can remove their own listing right
          after signing up; phone numbers are validated; basic spam protection built in.

Moving to parish hosting: the page only talks to the three API calls above, so it can sit
on any host as long as something answers those calls.
