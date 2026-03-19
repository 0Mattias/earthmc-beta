# EarthMC Tracker Beta - an agentic tracker for the EarthMC

This is a BETA BUILD of EarthMC Tracker ([Looking for the stable version?](https://github.com/0Mattias/earthmc-tracker)), featuring the all-new agent system linked to a real-time server database. Powered by Gemini 3.1 Pro and 3.1 Flash Lite. Ask the agent anything about EarthMC, and get expert insights served to you as they happen!
<img width="1696" height="1500" alt="image" src="https://github.com/user-attachments/assets/fbfb9f01-432d-43b6-9a69-37dcdfd07ae4" />




# ORIGINAL READ ME 👇

# EarthMC Tracker - a modded map and database for EarthMC
### Now memory efficient with near-instant query times, runs around 150 MB of RAM vs. 850 MB!
### give it a try at https://trollface.ai

### controls:
### -click on player count bar to hide players
### -click on coordinate bar to show towns
### -click on dice to show a random player
### -press ESC to close any tab

<img width="803" height="573" alt="Screenshot 2026-03-01 at 3 43 17 AM" src="https://github.com/user-attachments/assets/ff304150-9f91-4a26-bdc9-d06d0eb1aafe" />

## Story of EarthMC Tracker (Local Deployment Below):

<img width="344" height="441" alt="Screenshot 2026-03-01 at 3 57 40 AM" src="https://github.com/user-attachments/assets/f2b06f21-a71f-428b-8413-f377869f8aae" />

I started EarthMC Tracker as a side-project in late 2024 (named EarthMC Hunter) as a way to easily track server data. This was a private website I shared with my friends while we played on EarthMC. Over time, it grew quite large (and increasingly complex), and I quickly found it difficult to find efficient ways to query and store the data. Since I was playing less, I decided to put the project to rest and eventually retire EarthMC Hunter for good.

However with the upcoming reset in April 2026, I have decided to remake this project from the ground-up with my previously learned lessons. Now renamed "EarthMC Tracker", this version features a live map now along with a properly planned PostgreSQL database fed by a [backend worker](https://github.com/0Mattias/earthmc-scraper). It is capable of near-instant query times of all ~80k players in real time, and is time-stamped in the backend for historical recording. The feature I'm most proud of is the "Show path" feature, thanks to that historical database, I can query exactly where a player has been at any point in time. This goes for any piece of information really, and I plan on expanding what can be shown in the future.


# How to run locally:

This is designed to run in a Docker container. It is extremely lightweight, the production instance at https://trollface.ai runs on 1 vCPU and 512 MB of RAM. You can get away with being very cheap for the frontend. Remember to put your database login in the env

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the results. It is normal for the frontend to be barren without a database running. (Note: You must have a PostgreSQL 18 server along with a docker container running the [EarthMC API scraper!](https://github.com/0Mattias/earthmc-scraper)). Make sure you have a lot of storage ready too, or tune-down how much data is stored. The choice is yours.

I highly recommend using a cloud provider such as Google Cloud (you get a bunch of free credits for the free trial + bonus if you have Gemini). AWS, Azure, etc will work too. DO NOT make your instance request-based or your bill will be $50,000. Do not attempt to deploy this on your own unless you know what you're doing or you have a lot of time and sanity to spare.
