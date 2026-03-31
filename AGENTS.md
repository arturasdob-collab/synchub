# SyncHub — Agent Instructions

## Project
SyncHub is a SaaS logistics platform built with:
- Next.js App Router
- Supabase Auth + Database
- Vercel

Local dev:
- localhost:3000

## Core architecture rules
- organizations = tenant / workspace level
- companies = business objects inside organization scope
- organizations and companies must never be mixed

Current strategic direction:
- Tempus Trans is the main full-access organization
- other organizations will later have limited visibility
- partners should not see the full system
- future partner access will be limited through workflow/order visibility

## Working style
- respond step by step
- give only one step at a time unless explicitly asked otherwise
- keep answers short, clear, and structured
- do not rewrite large working parts unnecessarily
- first identify the problem, then propose the fix
- if code is needed, provide the exact full block or full file when appropriate
- if telling where to place code, specify the exact file and exact location
- preserve existing working logic unless change is required

## Development rules
- correct API route location is: app/api/...
- do not place API routes inside app/app/api/...
- after moving routes, local dev may require restart:
  - Ctrl + C
  - npm run dev

## Current stable modules
These are considered working and should not be broken unnecessarily:
- Admin / Users
- Organizations
- Audit Log
- Companies
- Company Contacts
- Company Comments
- Trips
- Trip order HTML preview/edit
- Trip order draft saving
- Draft cleanup with Vercel cron

## Important current trip/order logic
- Create Order / Edit Order opens HTML order preview in a new window
- manually editable order fields are stored in `trip_order_drafts`
- dynamic trip data must always be loaded live from trip data
- dynamic trip data must not be copied into draft storage
- if trip carrier/truck/trailer/driver/price/vat/payment changes, order must reflect latest trip values automatically
- manually entered loading/unloading/cargo/additional/carrier representative fields must persist

## Current preference for implementation
- prefer practical working solutions
- do not reintroduce docx/rtf workflow
- do not add unnecessary statuses or workflow complexity unless requested
- keep HTML order preview approach as the current stable solution

## Response rules for this project
- continue from the current working state
- do not propose unrelated refactors
- do not remove existing protections/permissions
- when planning new modules, start from DB structure, then API, then UI