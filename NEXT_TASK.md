# Next Task

## Current focus
Build the Orders module for SyncHub.

## Current project state
- Admin, Organizations, Audit Log, Companies, Contacts, Comments are working
- Trips module is working
- Trip HTML Order preview/edit is working
- trip_order_drafts is working
- current system state should remain stable

## Immediate goal
Design and implement a practical Orders module step by step.

## First priority
Define Orders DB structure in Supabase.

## After that
1. Create Orders table
2. Define relation between orders and trips
3. Build Orders create/list/view/edit MVP
4. Later connect order data into trip HTML order preview
5. Keep manual draft fields possible even after order integration

## Important rules
- do not break existing Trips logic
- do not return to docx/rtf workflow
- do not add unnecessary complexity
- work step by step
- give exact file locations and exact code blocks when needed

## What not to do now
- no Word/docx generation
- no extra workflow statuses
- no unnecessary UI redesign
- no major refactors