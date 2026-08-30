# Business model — Fiets of OV (approccio A: licenza B2G)

Data: 2026-08-04. Stato: approvato a voce in sessione, sezioni 1–5.
Regola madre: **zero costi fissi finché non c'è un bando o un contratto firmato che li paga.**

## 1. Prodotto

- L'app consumer resta **gratis, sempre**: è il motore di utenti e di dati, non un prodotto
  da monetizzare.
- Si vende la **licenza annuale per ente**:
  - app brandizzata sulla zona dell'ente (logo, geofence, campagna);
  - dashboard modal shift: confronti eseguiti, quante volte vince la bici, shift dichiarato
    dagli utenti;
  - due report l'anno scritti per finire dritti in una nota al consiglio comunale.
- Prezzi per taglia:
  - ente < 100k abitanti: **€15k/anno**
  - 100–500k: **€25k/anno**
  - grande città o vervoerregio: **€40k/anno**
  - pilota 3–6 mesi: **€10–15k una tantum**, che diventa credito se convertono in licenza.

## 2. Canale e sequenza (18 mesi)

- **Zero gare aperte**: tutti i prezzi stanno sotto la soglia di affidamento diretto per
  servizi (~€50k), quindi un funzionario può comprare senza aanbesteding.
- Sequenza:
  1. entro marzo: progetto MIT pronto, mail a SiR per la lista notifiche;
  2. 7 aprile: domanda MIT giorno 1 (€20.000 → modulo telemetria + DPIA/AVG);
  3. SiR wildcard alla prossima call → Amsterdam come launching customer pagante;
  4. fine 2026–2027: conversione pilota→licenza e secondo ente via referral
     (Vervoerregio, goedopweg).
- Ritmo atteso: **1–2 vendite l'anno**. Compatibile con costruzione part-time.

## 3. Economics

Regola: zero costi fissi prima dei fondi. Attuabile con lo stack corrente:

- Frontend statico: Cloudflare Pages o GitHub Pages — €0.
- Demo per giurie e pitch: l'app gira offline con `VITE_API_MODE=mock`, nessun server — €0.
- Backend OTP live solo quando serve: Oracle Cloud Always Free (4 core ARM, 24 GB RAM);
  il graph della sola regione Amsterdam ci sta — €0.
- Meteo: KNMI open data / Open-Meteo / Buienradar — €0. Geocoding: PDOK Locatieserver — €0.
- Unico esborso reale: il dominio, **~€10/anno** (o sottodominio gratuito fino al MIT).

L'infrastruttura di produzione (~€2.500/anno) è una voce **dentro il budget MIT**
(fino a €20.000) e **dentro il prezzo del pilota** (€10–15k include hosting). Mai di tasca
propria: se un ente vuole il servizio live h24, lo paga il suo contratto.

Ricavi attesi: anno 1 = MIT €20k + un pilota = **€30–35k**; anno 2 = due licenze + un
pilota = **€50–70k** ricorrenti-ish.

## 4. Fase 2 — pitch angel

Andare dagli angel **solo con**: una licenza rinnovata, un secondo ente firmato, [n] utenti
attivi. Prima è bruciarsi il contatto. La storia a quel punto:

- govtech SaaS ricorrente, **355 gemeenten** come mercato;
- il segmento werkgevers si apre da solo: obbligo WPM, aziende 100+ dipendenti
  rendicontano la mobilità casa–lavoro dal 2024, stesso dashboard;
- il ramo dati (approccio B) si accende qui, quando gli utenti ci sono.

Ask tipico: **€200–400k pre-seed** per il primo commerciale full-time.

## 5. Rischi

| Rischio | Risposta |
| --- | --- |
| SiR non riapre | Non aspettarla: affidamento diretto con uno stadsdeel o aggancio a goedopweg |
| Il comune vuole i dati | Solo aggregati, mai raw; DPIA pagata dal MIT |
| Stallo part-time | Il modello regge a 1 vendita/anno; la seconda licenza è il segnale per il full-time |
| Dipendenza da cliente unico | I report sono scritti per essere mostrati ad altri enti: referral incorporato |

## Dipendenze e licenze

Matrice completa delle API esterne (meteo, radar, tile, geocoding, POI, routing) con stato
d'uso commerciale e sostituzioni a €0 (KNMI, PDOK, OpenFreeMap, POI in build):
`Dev_Vault/Fiets-of-OV/Manual/12_External-APIs-and-Licensing.md` (vault Obsidian).
Sintesi: nessuna licenza da comprare in nessuna fase; obbligo permanente di attribuzione
"© OpenStreetMap contributors" (ODbL) e credit KNMI/PDOK dove esposti.
