# SyncHub Project Context

## Current active state

- SyncHub uses Next.js App Router + Supabase + Vercel
- Admin, Organizations, Audit Log, Companies, Contacts, Comments are working
- Trips module is working
- Trip HTML Order preview/edit is working
- Manual order fields are stored in trip_order_drafts
- Dynamic trip data is always loaded live from trip data
- Draft cleanup is handled by Vercel cron
- Current next priority is Orders module
- Goal: design practical Orders DB structure and trip linking

## Full project context
Tęsi darbą su mano projektu „SyncHub“ (Next.js App Router + Supabase). Žemiau yra pilna, sujungta projekto santrauka iš ankstesnių langų, kad neprarastum konteksto.

# 1. PROJEKTAS IR ARCHITEKTŪRA

Projektas: SyncHub

Technologijos:
- Frontend: Next.js App Router
- Backend / Auth / DB: Supabase
- Hosting / Deploy: Vercel
- Lokalinis paleidimas: localhost:3000

Tikslas:
Kurti SaaS logistikos platformą, kurioje būtų valdoma:
- organizations
- users
- roles
- permissions
- audit log
- companies
- contacts
- comments / rating
- vėliau orders
- vėliau trips
- vėliau partnerių/shared workflow logika

Svarbi architektūrinė taisyklė:
- organizations = sistemos tenant / workspace lygis
- companies = verslo objektai organizacijos viduje
- organizations ir companies negalima maišyti

Dabartinis strateginis sprendimas:
- Tempus Trans = pagrindinė pilna sistema
- kitos organizacijos ateityje neturės matyti visos sistemos
- jos matys tik joms parodytą panelę / veiksmus / orderius
- partneriai neturės pilno admin/companies/orders/trips funkcionalumo
- vėliau partneriams bus duodama ribota prieiga per order workflow
- jei ateityje partneris norės pilnos sistemos, ją gaus savo organizacijos ribose

# 2. DARBO TAISYKLĖS

Labai svarbu:
- atsakinėti po 1 žingsnį
- be ilgų tekstų
- jei reikia keisti kodą, tiksliai nurodyti failą ir vietą
- jei prašau pilno bloko, duoti pilną veikiantį failą / funkciją
- neperrašinėti pusės projekto be reikalo
- pirma identifikuoti problemą, tik tada siūlyti pataisymą

# 3. ROLE SISTEMA

Naudojamos rolės:
- CREATOR (per is_creator)
- SUPER_ADMIN (per is_super_admin)
- OWNER
- ADMIN
- MANAGER
- ACCOUNTANT
- FINANCE

Svarbios taisyklės:
- Creator negalima modifikuoti, disable’inti, delete’inti ar downgrade’inti
- SUPER_ADMIN turi plačias teises
- CREATOR gali kurti ir trinti organizations
- OWNER / ADMIN gali valdyti users
- Audit Log mato tik SUPER_ADMIN ir CREATOR
- komentarus šiuo metu redaguoti / trinti gali:
  - SUPER_ADMIN
  - CREATOR
  - OWNER
  - komentaro autorius
- ADMIN komentarų redaguoti / trinti negali

# 4. ESAMOS DB LENTELĖS

Esamos svarbios lentelės:
- user_profiles
- organizations
- audit_logs
- pending_invites
- companies
- company_contacts
- company_comments

user_profiles svarbūs laukai:
- id
- email
- role
- organization_id
- disabled
- created_at
- is_super_admin
- is_creator
- first_name
- last_name

organizations svarbūs laukai:
- id
- name
- type

audit_logs svarbūs laukai:
- id
- action
- actor_id
- target_id
- details
- organization_id
- created_at

pending_invites svarbūs laukai:
- id
- email
- role
- organization_id
- invited_by
- created_at
- expires_at

companies svarbūs laukai:
- id (UUID, techninis, vartotojui nerodomas)
- organization_id
- company_code (vartotojui matomas identifikatorius)
- name
- country
- city
- address
- postal_code
- vat_code
- is_client
- is_carrier
- phone
- email
- website
- responsible_user_id
- rating
- notes
- created_at
- created_by
- insurance_number
- insurance_valid_from
- insurance_valid_until
- insurance_amount
- payment_term_days (reikalingas trips moduliui)

company_contacts svarbūs laukai:
- id
- company_id
- organization_id
- first_name
- last_name
- position
- phone
- email
- notes
- is_active
- created_at
- created_by

company_comments svarbūs laukai:
- id
- company_id
- organization_id
- comment
- rating (1–5)
- created_at
- created_by

Svarbus sprendimas dėl company ID:
- UI vartotojui nerodo techninio UUID
- vartotojui rodomas company_code
- DB viduje lieka UUID kaip primary key

# 5. ADMIN MODULIS – KAS PADARYTA IR VEIKIA

Puslapiai:
- /app/admin/users
- /app/admin/organizations
- /app/admin/audit-log

## 5.1. User Management – veikia
Veikia:
- Add User
- Invite User
- Disable / Enable user
- Delete user
- Role change
- Pending confirmation / Active / Disabled statusai
- apsaugos Creator ir Super Admin
- Last OWNER apsaugos pradėtos ir veikia role logikoje

Manage Users logika:
- Active:
  - disabled = false
  - nėra pending invite
- Pending confirmation:
  - yra pending invite
- Disabled:
  - disabled = true
  - nėra pending invite

Papildomai:
- Pending user nerodomas Disable mygtukas
- Pending user Joined stulpelyje rodoma „Invitation sent“

## 5.2. Invite Flow – veikia
Invite lange yra:
- Email
- Role
- Organization dropdown

Invite logika:
- admin pasirenka organization iš organizations
- į invite metadata įrašoma:
  - role
  - organization_id
  - invited_by
- sukuriamas pending_invites įrašas
- sukuriamas / atnaujinamas user_profiles įrašas su disabled = true

Po registracijos per set-password:
- user suveda first name
- last name
- password
- organization tik rodoma, nekeičiamas

Po užbaigimo:
- first_name įsirašo
- last_name įsirašo
- disabled tampa false
- pending invite ištrinamas
- status tampa Active

## 5.3. Set-password logika – veikia
Failas:
- app/set-password/page.tsx

Svarbu:
- organization readonly
- organization_id nebeieškomas pagal tekstą
- naudojamas tas organization_id, kuris atėjo iš invite
- user_profiles update registracijos metu:
  - first_name
  - last_name
  - disabled = false
- pending invite po registracijos ištrinamas

Buvo pridėtos policy:
- leidžianti user atnaujinti savo profilį po invite
- leidžianti user ištrinti savo pending invite pagal email

## 5.4. Organizations modulis – veikia
Dabar organizations valdomos atskirame puslapyje:
- /app/admin/organizations

Veikia:
- Add Organization
- Rename Organization
- Delete Organization
- users_count rodymas
- pending_invites_count rodymas
- created_at rodymas

Delete logika:
- organization negalima trinti jei:
  - turi users
  - turi pending invites

UI logika:
- delete mygtukas disabled jei yra users ar pending invites
- rodomi aiškūs tekstai:
  - Cannot delete: organization has users
  - Cannot delete: organization has pending invites
  - Cannot delete: organization has users and pending invites

Manage Users puslapyje Add Organization jau pašalintas.

## 5.5. Audit Log – veikia
Puslapis:
- /app/admin/audit-log

Rodo:
- Time
- Action
- Actor
- Target
- Organization
- Details

Veiksmų tipai:
- role_change
- user_disable
- user_enable
- user_delete
- user_invite
- user_create
- organization_create
- organization_update
- organization_delete

Prieigos logika:
- mato tik SUPER_ADMIN ir CREATOR
- OWNER / ADMIN sidebar’e Audit Log nemato
- ir ranka įvedus URL yra nukreipiami lauk

# 6. SVARBIAUSI DABARTINIAI ADMIN API ROUTE

- app/api/admin/invite/route.ts
- app/api/admin/users/route.ts
- app/api/admin/users/create/route.ts
- app/api/admin/users/delete/route.ts
- app/api/admin/users/toggle-disabled/route.ts
- app/api/admin/organizations/create/route.ts
- app/api/admin/organizations/list/route.ts
- app/api/admin/organizations/update/route.ts
- app/api/admin/organizations/delete/route.ts
- app/api/admin/cleanup-invites/route.ts

Trumpai ką jie daro:
- invite route:
  - priima email, role, organizationId
  - tikrina teises
  - kviečia inviteUserByEmail
  - įrašo pending_invites
  - įrašo / atnaujina user_profiles
  - rašo audit log user_invite
- users route:
  - grąžina users sąrašą
  - prideda is_pending pagal pending_invites
- users/create:
  - sukuria auth user
  - atnaujina profile
  - rašo audit log user_create
- toggle-disabled:
  - enable / disable logika
- organizations/create:
  - kuria organization
  - tik creator / super admin
  - rašo audit log
- organizations/delete:
  - trina tik jei nėra users ir pending invites
  - rašo audit log
- cleanup-invites:
  - tvarko expired invites

# 7. COMPANIES MODULIS – PADARYTA IR VEIKIA

Sidebar pridėtas:
- Companies

Puslapiai:
- /app/companies
- /app/companies/new
- /app/companies/[id]

## 7.1. Companies list – veikia
Failas:
- app/app/companies/page.tsx

Veikia:
- companies lentelė
- search pagal company name
- search pagal company_code
- pagination
- Add Company mygtukas
- paspaudus ant eilutės atsidaro company card
- filtrai:
  - All
  - Client
  - Carrier
- filtrų skaičiai rodo bendrą DB įmonių skaičių, ne tik dabartinį puslapį

## 7.2. Add Company – veikia
Puslapis:
- /app/companies/new

Laukai:
- company_code
- name
- VAT
- country
- city
- address
- postal_code
- phone
- email
- website
- client checkbox
- carrier checkbox
- notes

Papildoma logika:
- Company name formoje rodomas pirmas, prieš Company code
- Country pasirinkimas veikia per dropdown / datalist
- veikia tiek Add Company, tiek Edit Company

Išsaugo į DB:
- organization_id
- created_by

## 7.3. Company Card – veikia
Puslapis:
- /app/companies/[id]

Veikia:
- Company Information blokas
- Contact & Address blokas
- Notes blokas
- Contacts blokas
- Comments blokas
- Created by
- Created at
- Edit Company
- Save / Cancel

Contact & Address rodymo tvarka:
- gatvė
- miestas
- pašto kodas
- šalis

Created by logika:
- company turi created_by
- kortelėje rodo kas sukūrė įmonę ir kada

## 7.4. Companies modulyje papildomai padaryta
Veikia tikrinimas, ar įmonė jau egzistuoja:
- pagal Company name
- pagal Company code
- tikrinimas veikia tiek kuriant, tiek redaguojant

Carrier logika:
- yra Carrier checkbox
- yra CMR draudimo logika ir laukai:
  - insurance number
  - valid from
  - valid until
  - insurance amount

CMR statusas kortelėje:
- Valid
- Expired

Papildoma pastaba:
- trips moduliui reikės company payment term laukelio, pvz. payment_term_days = 30

## 7.5. Company Contacts – veikia
API:
- app/api/company-contacts/create/route.ts
- app/api/company-contacts/update/route.ts
- app/api/company-contacts/delete/route.ts

UI veikia:
- kontaktų sąrašas
- Add contact forma po mygtuku
- Save / Cancel
- Edit contact
- Delete contact
- confirm delete
- kontaktai sutvarkyti į vieną eilutę
- avatar su initials
- ikonėlės:
  - role / position
  - phone
  - email

## 7.6. Company Comments – veikia
API:
- app/api/company-comments/create/route.ts
- app/api/company-comments/update/route.ts
- app/api/company-comments/delete/route.ts

UI veikia:
- galima pridėti komentarą
- galima pasirinkti rating 1–5 žvaigždutėmis
- komentarų istorija rodoma
- komentaras turi:
  - autorių
  - datą
  - rating
  - tekstą
- comment edit veikia
- comment delete veikia
- delete turi confirm

Komentarų permissions:
- SUPER_ADMIN gali edit/delete
- CREATOR gali edit/delete
- OWNER gali edit/delete
- komentaro autorius gali edit/delete
- ADMIN negali
- kiti vartotojai Edit/Delete mygtukų nemato

Svarbus niuansas:
- tos pačios organizacijos vartotojai mato autoriaus vardą
- kitų organizacijų vartotojams autoriaus vardas gali nesimatyti dėl dabartinės tenant izoliacijos
- kol kas palikta kaip yra

# 8. SVARBIOS TECHNINĖS PASTABOS IŠ VYSTYMO

Buvo daug klaidų dėl route vietos.

Teisinga API struktūra:
- app/api/...

Neteisinga:
- app/app/api/...

Tai kartojosi su:
- companies update
- company-contacts update/delete
- company-comments create/update/delete

Po route perkėlimo dažnai reikėdavo:
- Ctrl + C
- npm run dev

Dabartinės sutvarkytos route vietos:
- app/api/companies/create/route.ts
- app/api/companies/update/route.ts
- app/api/company-contacts/create/route.ts
- app/api/company-contacts/update/route.ts
- app/api/company-contacts/delete/route.ts
- app/api/company-comments/create/route.ts
- app/api/company-comments/update/route.ts
- app/api/company-comments/delete/route.ts

# 9. DABARTINĖS TEISĖS IR MATOMUMO LOGIKA

Bendra kryptis:
- SUPER_ADMIN / CREATOR / OWNER / ADMIN turi platesnes teises
- kai kuriose vietose OWNER tik savo organizacijoje
- partneriai nemato admin dalių
- būsimi Orders ir Trips turi būti filtruojami pagal:
  - kūrėją
  - teises
  - organizaciją
  - papildomai parodytus vartotojus

# 10. KAS ŠIUO METU PILNAI VEIKIA

Admin:
- Manage Users ✅
- Manage Organizations ✅
- Audit Log ✅

Users:
- Add User ✅
- Invite User ✅
- Disable / Enable ✅
- Delete ✅
- Role change ✅

Organizations:
- Create ✅
- Rename ✅
- Delete su apsauga ✅
- users_count ✅
- pending_invites_count ✅

Companies:
- List ✅
- Search ✅
- Pagination ✅
- Add Company ✅
- Company Card ✅
- Edit Company ✅
- duplicate check pagal name/code ✅
- country dropdown ✅
- postal code ✅
- carrier + CMR fields ✅
- CMR valid / expired status ✅
- filtrai All / Client / Carrier ✅

Contacts:
- Add ✅
- Edit ✅
- Delete ✅
- Confirm delete ✅

Comments:
- Add ✅
- Edit ✅
- Delete ✅
- 1–5 stars ✅
- permissions ✅

# 11. DABARTINIS KITAS MODULIS – TRIPS / REISAI

Šiame etape Companies modulis baigtas ir dabar pereiname prie naujo modulio:
- Reisai / Trips

## 11.1. Reiso vizija
Reisas yra atskiras modulis, kurį galima kurti iš pagrindinio meniu.

Reisą gali kurti:
- visi vartotojai

Reisą redaguoti gali:
- reiso kūrėjas
- SUPER_ADMIN
- CREATOR
- OWNER
- ADMIN

## 11.2. Reiso matomumas
Pradžioje reisą mato:
- reiso kūrėjas
- SUPER_ADMIN
- CREATOR
- OWNER
- ADMIN

Kiti vartotojai reiso nemato, nebent:
- tas reisas yra susietas su užsakymu
- ir tas užsakymas jiems parodytas matyti

Vėliau bus logika, kad per:
- užsakymą
- atsakingą vadybininką
- organizaciją
- pasirinkimus
sistema išplės matomumą

## 11.3. Bendra sistemos koncepcija
Yra pagrindinis meniu su moduliais:
- įmonės
- reisai
- užsakymai
- ir t. t.

Ten kuriame, redaguojame, triname, siejame duomenis.

Po to kiekvienas vartotojas savo dashboard’e matys:
- savo aktyvius reisus
- savo aktyvius užsakymus
- kas su kuo susieta
- eiga
- seka
- statusai
- kam parodyta informacija

Vėliau bus pasirinkimas parodyti informaciją konkretiems vartotojams pagal vardą / pavardę iš sistemos vartotojų sąrašo.

Bus ryšys tarp:
- vartotojų
- organizacijų
- reisų
- užsakymų

## 11.4. Reiso statusai
Reikalingi statusai:
- Nepatvirtintas
  - kol reisas nesusegtas su užsakymu
- Patvirtintas
  - kai reisas susietas su užsakymu
- Užbaigtas
  - kai vykdantis vadybininkas savo panelėje pažymi, kad iškrauta / pristatyta

## 11.5. Kuriant reisą turi būti laukai
- statusas
- vežėjas
  - pasirenkamas iš jau sukurtų Carrier įmonių sąrašo
- vilkiko numeris
- priekabos numeris
- vairuotojas
- kaina
- apmokėjimo terminas
- apmokėjimo tipas
- PVM
- pastabos
- grupažo požymis

## 11.6. Vežėjo pasirinkimo logika
- vežėjas pasirenkamas iš esamų Companies, kur is_carrier = true
- vežėjo vadybininko rinktis nereikia
- pasirinkus vežėją turi automatiškai užsipildyti apmokėjimo terminas iš vežėjo kortelės
- todėl Companies modulyje reikia turėti lauką:
  - payment_term_days, pvz. 30
- bet kuriant / redaguojant reisą tą terminą turi būti galima keisti ranka

## 11.7. Apmokėjimo tipai
Reikalingi variantai:
- pavedimu po skanu
- pavedimu po originalių dokumentų paštu
- grynais
- kita

## 11.8. PVM logika
Reikia pasirinkimo iš sąrašo, bent jau:
- 21%
- 0%
- ir kiti variantai kaip senoje sistemoje
- vėliau galės būti plečiama

## 11.9. Grupažo logika
Jei pažymima, kad tai grupažo reisas:
- prie šio reiso bus galima pridėti daug užsakymų
- galima turėti tarpines perkrovas
- gali būti susieti ir kiti reisai
- šis grupažo reisas tampa pagrindiniu paskirstant pajamas / išlaidas
- paskirstymą galės valdyti tas asmuo, kuris bus priskirtas grupažo reisui

Jei pažymėtas grupažo reisas:
- reikia pasirinkti Tempus Trans organizacijos vadybininką iš esamų sistemos vartotojų sąrašo

## 11.10. Jei grupažo reisas nepažymėtas
Apačioje turi būti prisegimas prie užsakymo:
- jei vadybininkui jau parodytas tam tikras užsakymas, jis gali iš sąrašo pasirinkti tą užsakymą ir prisegti reisą
- jei užsakymas jam dar nerodomas, bet jis žino užsakymo numerį, jis gali jį įvesti ranka
- tokiu atveju sistema traktuoja, kad jis turi teisę disponuoti tuo užsakymu ir susieja reisą su tuo užsakymu

## 11.11. Susiejus reisą su užsakymu
- reisas ir užsakymas sinchronizuojasi
- perduodama / gaunama informacija apie:
  - pakrovimą
  - iškrovimą
  - pajamas
  - išlaidas
  - kitus susijusius duomenis

## 11.12. Po sukūrimo
- reisas išsisaugo
- gauna numerį
- atsiranda reisų istorijoje

## 11.13. UI / orientacija
Yra pateikti screenshotai iš senos sistemos:
- reisų istorija su filtrais ir puslapiais
- naujo reiso kūrimo forma
- esamo reiso peržiūra / redagavimas
- PVM pasirinkimo variantai

Svarbu:
- nereikia kopijuoti dizaino 1:1
- reikia perkelti logiką ir pagrindinius laukus
- pirmiausia daryti bazinį veikiantį variantą
- be bereikalingo sudėtingumo
- eiti po žingsnį

# 12. KAS LOGIŠKIAUSIA TOLIAU

Šiuo metu logiškiausias tęsinys:
1. Suprojektuoti Trips DB struktūrą
2. Apibrėžti ryšius su:
   - users
   - organizations
   - companies
   - future orders
3. Padaryti pirmą Trips MVP:
   - DB lentelė trips
   - bazinis create/list/edit
   - carrier pasirinkimas iš companies
   - statusas
   - kaina
   - payment term
   - payment type
   - vat
   - notes
   - is_groupage
4. Tik po to eiti į orders/trip linking
5. Vėliau daryti strict organization isolation / collaboration layer

# 13. KO NORIU IŠ TAVĘS TĘSIANT NAUJAME LANGE

Pirmiausia:
- išanalizuok visą šį kontekstą
- sudėliok trumpą aiškų planą Trips moduliui:
  - DB lentelės
  - ryšiai su users / organizations / companies / orders
  - koks pirmas MVP

Tada:
- pradėkime nuo pirmo techninio žingsnio
- Supabase DB struktūros Reisams
- tik po vieną žingsnį
- be ilgų tekstų
- be scriptų į priekį, kol nepatvirtinu esamo žingsnio

# 14. SVARBI PASTABA API / UI TEISĖMS

Komentarų logika turi likti tokia:
- SUPER_ADMIN ✅
- CREATOR ✅
- OWNER ✅
- comment author ✅
- ADMIN ❌

Komentaruose:
- autorius + data turi būti matomi visiems, kas mato komentarą
- Edit/Delete turi būti matomi tik turintiems teisę

# 15. GERIAUSIAS STARTAS TĘSIMUI

---

## Latest continuation context
Tęsiam SyncHub nuo dabartinės būsenos. Admin / users / organizations / audit log / companies / contacts / comments jau veikia. Companies modulis baigtas. Dabar pereiname prie Trips modulio. Atsakinėk trumpai, aiškiai, struktūruotai, po 1 žingsnį. Pirmas žingsnis: pasiūlyk Trips DB struktūrą Supabase.

cia paskutinio lango darbas ir promtas: 
Tu tęsi darbą su mano projektu „SyncHub“ (Next.js App Router + Supabase + Vercel). Dirbam toliau nuo jau veikiančios būsenos, nieko negriaunant, nekeičiam logikos be reikalo, o tęsiam nuosekliai.

Svarbu:
- atsakinėk trumpai, aiškiai, struktūruotai
- rašyk žingsniais, po vieną žingsnį
- jei reikia kažką keisti kode, duok pilną tikslų bloką arba pilną failą, o ne miglotas nuorodas
- jei sakai kur įdėti kodą, parašyk tiksliai po kokios eilutės ar po kokiu bloku
- jei keičiam failą stipriai, geriau duok visą pilną failą
- nedaryk bereikalingų „patobulinimų“
- nekeisk veikiančios logikos be priežasties
- svarbiausia: tęsiam nuo to, kas jau padaryta

==================================================
PROJEKTO KONTEKSTAS
==================================================

Projektas:
- SyncHub
- stack: Next.js App Router
- Supabase Auth + DB
- Vercel deploy
- lokalus paleidimas per localhost:3000

Pagrindinė dabartinė kryptis:
- jau padarytas Trips modulis
- jau padarytas order kūrimas iš reiso
- vietoj Word/RTF galutiniam etapui pasirinktas HTML order preview/edit variantas
- order galima redaguoti, saugoti draft, vėl atidaryti, koreguoti ir iš jo daryti PDF per print/save PDF

==================================================
KAS JAU PADARYTA
==================================================

1. Trips modulis
Padaryta ir veikia:
- `/app/trips` reisų sąrašas
- filtrai:
  - search
  - status
  - created by
  - trip type
- creator paieška veikia per rankinį įvedimą ir pasirinkimą
- puslapiavimas veikia
- reiso kortelės atsidaro

2. Reiso kortelė `/app/trips/[id]`
Padaryta:
- reiso informacijos atvaizdavimas
- `Edit`
- `Create/Edit Order` mygtukas
- jei order draft nėra → rodo `Create Order`
- jei order draft yra → rodo `Edit Order`

Prie viršutinės reiso informacijos rodoma:
- `Order draft Saved`
- `Order draft updated ...`

3. Buvo bandyta Word / docx / rtf generacija
Buvo bandyta:
- `docx`
- po to `rtf`

Bet galutiniam darbiniam variantui pasirinktas:
- HTML order preview / edit

Priežastis:
- HTML leidžia tvarkingai valdyti layout
- lengva daryti blokus
- lengva pildyti ranka
- galima daryti PDF per browser `Print / Save PDF`
- daug stabilesnis variantas negu `docx`/`rtf`

4. HTML order preview
Sukurtas HTML order langas, atsidarantis naujame lange per `window.open()`.

Ten yra:
- gražus order išdėstymas
- blokai:
  - CLIENT
  - CARRIER
  - LOADING INFORMATION
  - UNLOADING INFORMATION
  - CARGO DETAILS
  - VEHICLE INFORMATION
  - PRICE AND PAYMENT
  - ADDITIONAL CONDITIONS
- antrame lape:
  - TRANSPORT TERMS
  - ORDER CONFIRMATION

5. HTML lange rankiniu būdu redaguojami laukai
Padaryti redaguojami laukai:
- `loading_date`
- `loading_text`
- `unloading_date`
- `unloading_text`
- `cargo_text`
- `additional_conditions`
- `carrier_representative`

Labai svarbi logika:
- šitie laukai saugomi kaip draft
- jie turi išlikti pakartotinai atidarius order

6. Draft saugojimas DB
Sukurta lentelė:
- `public.trip_order_drafts`

Joje saugoma tik tai, kas pildoma ranka HTML order lange:
- `id`
- `trip_id`
- `loading_date`
- `loading_text`
- `unloading_date`
- `unloading_text`
- `cargo_text`
- `additional_conditions`
- `carrier_representative`
- `status`
- `updated_by`
- `created_at`
- `updated_at`

Labai svarbi logika:
- trip duomenys NESaugomi šitoje lentelėje
- jie kiekvieną kartą turi būti paimami gyvai iš trip

Tai reiškia:
jei reise pasikeičia:
- vežėjas
- vežėjo rekvizitai
- truck plate
- trailer plate
- driver
- price
- VAT
- payment method
- payment terms

tada order lange šitie duomenys turi automatiškai pasikeisti pagal naują trip būseną.

Bet ranka pildyti laukai:
- loading
- unloading
- cargo
- additional conditions
- carrier representative

turi išlikti.

Tai buvo mano sąlyga, nes jei reise pakeičiam vežėją, turi būti lengva tam pačiam orderiui pritaikyti naują vežėją, neprarandant jau suvesto pakrovimo / iškrovimo / krovinio teksto.

7. Draft API
Sukurtas route:
- `app/api/trips/order-draft/route.ts`

Jis daro:
- `GET` → užkrauna draft pagal `tripId`
- `POST` → sukuria arba atnaujina draft

8. HTML route
Sukurtas route:
- `app/api/trips/create-order-html/route.ts`

Jis:
- paima trip duomenis
- paima carrier duomenis
- paima draft duomenis
- sugeneruoja redaguojamą HTML order langą

9. HTML lange yra mygtukai
Šiuo metu yra:
- `Save Draft`
- `Cancel`
- `Print / Save PDF`

Logika:
- `Save Draft` → išsaugo draft į DB
- `Cancel` → grąžina laukus į paskutinę išsaugotą būseną ir uždaro langą
- `Print / Save PDF` → leidžia pasidaryti PDF iš HTML

10. Cancel logika
Veikia taip:
- jei user kažką prirašė, bet nenori palikti
- spaudžia `Cancel`
- laukų reikšmės grįžta į paskutinį išsaugotą variantą
- tada langas užsidaro

11. Order draft būsena reiso puslapyje
Prie reiso kortelės jau rodoma:
- ar order draft yra
- kada paskutinį kartą atnaujintas

12. Draft valymas po 7 dienų
Sukurtas cleanup route:
- `app/api/trips/order-draft-cleanup/route.ts`

Jis:
- trina tik iš `trip_order_drafts`
- trina tik tuos draft, kurių `updated_at` senesnis nei 7 dienos

Labai svarbu:
- netrina pačių `trips`
- netrina kitų sistemos lentelių
- netrina PDF, email ar kitų failų

13. Cleanup paleidimas
Cleanup nededamas prie kiekvieno `Create/Edit Order` paspaudimo, nes tai būtų bloga logika ir bereikalinga apkrova.

Vietoj to:
- sukurtas `vercel.json`
- nustatytas Vercel cron
- naudojamas `CRON_SECRET`

Cron skirtas kas naktį valyti senus draft.

14. Git / Vercel
Padaryta:
- `git push --set-upstream origin master`
- branch susietas
- Vercel turi pasiimti deploy

==================================================
SVARBŪS FAILAI
==================================================

Šiuo metu svarbiausi failai yra:

- `app/app/trips/page.tsx`
- `app/app/trips/[id]/page.tsx`
- `app/api/trips/create-order-html/route.ts`
- `app/api/trips/order-draft/route.ts`
- `app/api/trips/order-draft-cleanup/route.ts`
- `vercel.json`

==================================================
LABAI SVARBI DABARTINĖ DARBO LOGIKA
==================================================

1. Order kūrimo logika turi likti tokia:
- spaudi `Create Order` arba `Edit Order`
- atsidaro HTML order langas

2. Ranka pildomi laukeliai turi būti saugomi draft lentelėje

3. Dinaminiai trip duomenys turi būti imami gyvai iš trip kiekvieną kartą
- ne kopijuojami į draft

4. Jei reise pakeičiam vežėją, order turi rodyti naują vežėją ir jo rekvizitus automatiškai

5. Jei reise pakeičiam truck / trailer / driver / price / vat / payment, order turi rodyti naujausią variantą

6. Ranka pildomas loading/unloading/cargo/additional tekstas turi išlikti

7. PDF nėra saugomas sistemoje
- jis išsisaugomas per `Print / Save PDF`
- vadybininkas oficialų PDF archyvuoja pašte / debesyje
- sistemoje laikom tik trumpalaikį draft redagavimui

8. Draft po 7 dienų gali būti trinamas, nes oficialus archyvas lieka ne sistemoje

==================================================
KAS DABAR NEDAROMA
==================================================

Kol kas sąmoningai nedarome:
- Word `.docx`
- papildomų order statusų mygtukų (`ready/sent`)
- parašo / antspaudo
- logo į order
- sudėtingų workflow būsenų

Priežastis:
- dabartinis workflow jau veikia
- nenorim apkrauti naudotojų nereikalingais mygtukais
- nenorim gadinti veikiančio sprendimo

==================================================
DABARTINĖ BŪSENA — LAIKYTI JĄ STABILIA
==================================================

Dabartinis rezultatas laikomas geru ir veikiančiu:
- HTML preview atrodo gerai
- galima suvesti duomenis
- galima išsaugoti draft
- galima vėl atidaryti ir redaguoti
- galima PDF
- galima atsisakyti pakeitimų per Cancel

Todėl toliau judam prie kito etapo.

==================================================
KAS TOLIAU BUS DAROMA
==================================================

Toliau norime kurti:
- užsakymų modulį
- užsakymų suvedimą
- užsakymų apjungimą su reisais

Būtent tai yra kitas etapas.

Tikslas:
- turėti atskirą Orders modulį
- suvesti užsakymus sistemoje
- susieti juos su reisais
- vėliau order HTML duomenis dalinai pildyti iš užsakymo

Būsima logika:
- order neturi būti pildomas vien tik ranka
- kai užsakymas bus susietas su reisu, dalis duomenų galės ateiti iš užsakymo
- bet rankinis papildymas vis tiek turi likti įmanomas

Potencialūs duomenys, kuriuos vėliau order galės imti iš užsakymo:
- loading info
- unloading info
- shipper
- consignee
- cargo info
- address / city / country
- contacts
- customs info
- reference

==================================================
KĄ NORIU DARYTI DABAR
==================================================

Dabar tęsiam būtent nuo šito taško:

- planuoti ir kurti užsakymų modulį
- galvoti DB struktūrą užsakymams
- kaip užsakymus sieti su reisais
- kaip vėliau iš užsakymo pildyti order HTML

Svarbu:
- nenoriu dabar grįžti prie Word
- nenoriu dabar papildomų statusų mygtukų orderiui
- nenoriu dabar nereikalingų UI komplikacijų
- noriu praktiško sprendimo darbui

Dirbam žingsniais.
Pirmas tavo žingsnis naujame lange turi būti:
- pasiūlyti aiškią, praktišką `Orders` modulio struktūrą
- kokie pagrindiniai laukai
- kaip sieti orderius su reisais
- ir ką geriausia daryti pirma