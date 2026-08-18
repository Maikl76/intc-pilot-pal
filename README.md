# INTC Trading Pilot

Decision-support a paper-trading nástroj pro mean-reversion strategii na akcii **Intel (INTC)**.
UI je v češtině. **LIVE obchodování je ve výchozím stavu vypnuté.**

## Bezpečnostní model

- Výchozí režim je **PAPER** — pokyny se pouze simulují na serveru, nic neodchází na burzu.
- **LIVE** režim je viditelně červeně označen a vyžaduje dva kroky: „Připravit objednávku“ a poté
  samostatné potvrzení konkrétní objednávky. Nikdy nevzniká automatický market order.
- API Key/Secret **nikdy** nejsou v klientském bundlu ani v localStorage. Čtou se výhradně na
  serveru uvnitř handlerů (`process.env`), v UI se zobrazuje jen maskovaný stav.
- Lokálně (localStorage) se ukládá pouze stav strategie, historie a parametry — žádné secrety.

## Kam patří secrety

Project Settings → **Secrets**. Nikdy do `.env` v repozitáři, nikdy do kódu.

| Secret | Účel | Povinné |
| --- | --- | --- |
| `TRADING212_API_KEY` | API klíč Trading 212 (Invest účet) | pro LIVE |
| `TRADING212_API_SECRET` | Secret, pokud jej účet používá | volitelné |
| `TRADING212_BASE_URL` | `https://demo.trading212.com` nebo `https://live.trading212.com` | doporučeno |
| `MARKET_DATA_API_KEY` | Fallback provider kotací (Finnhub / Twelve Data) | volitelné |

### Kroky napojení Trading 212

1. V Trading 212 → Settings → API (Beta) vygeneruj klíč pro **Invest** účet.
2. Začni s **demo** prostředím: `TRADING212_BASE_URL = https://demo.trading212.com`.
3. Vlož secrety v Project Settings → Secrets a aplikaci publikuj (server si je načte za běhu).
4. Na stránce **Nastavení** ověř, že se stav secretu přepnul na „nastaveno“ (maskovaně).
5. Ověř čtení portfolia a kotace v PAPER režimu.
6. Teprve poté v `src/lib/orders.functions.ts` odkomentuj integrační blok pro odeslání pokynu
   (`/api/v0/equity/orders/limit`) — je záměrně vypnutý jako beta pojistka.
7. Přepni přepínač v hlavičce na LIVE. Každá objednávka i tak vyžaduje druhé potvrzení.

## Trading 212 beta — ochrany v kódu

`src/lib/trading212.server.ts` obsahuje:

- **token-bucket rate limiter** (konzervativně pod limity bety),
- **retry s exponenciálním backoffem + jitter** pro 429 a 5xx,
- **idempotenční cache** klíčů objednávek proti duplicitnímu odeslání.

## Datový provider

`src/lib/market.functions.ts` je abstrakce nad kotacemi s adaptéry `MOCK` (default),
`TRADING212` a `EXTERNAL`. Trading 212 beta nemusí umět dodat quote bez otevřené pozice, proto
je fallback adaptér připraven pro Finnhub / Twelve Data. Aktivní zdroj je vždy vidět v UI jako
„Data source“.

## Strategie (výchozí parametry)

- tranše 10 000 Kč (rozsah 5 000–15 000), konstantní i během poklesu,
- max. expozice 300 000 Kč,
- stop-add při poklesu 8 % od referenční ceny prvního nákupu cyklu,
- minimální cooldown 5 kalendářních dní,
- restart až po reboundu ≥ 3 % od minima dosaženého v cooldownu,
- preferovaná měna USD; jinak upozornění na FX náklad,
- prodej: modul A (nad průměrem) / B (nad tranší) / **C – ruční potvrzení, default**, target 0,5–5 %.

Všechny parametry lze měnit v Nastavení; každá změna se loguje do historie.

## Backtest

Stránka **Backtest** ukazuje pouze historickou referenci z replaye 2025+2026 (kandidátní sada
15k / 8 % / 5 d / 3 % / 300k zlepšila poměr zisku k drawdownu). Žádné budoucí výnosy nejsou
hardcodované ani slibované.

## Alerty a budoucí rozšíření

Alerty (buy zone, stop-add, cooldown/restart, sell target, risk) běží in-app. Pro budoucí
webhook/e-mail doručování stačí přidat server route pod `src/routes/api/public/` a volat ji z
generátoru alertů v `src/lib/store.tsx` — aplikace na žádné externí službě nezávisí.

## Demo data

Bez API klíčů běží aplikace na demo seedu (`src/lib/seed.ts`) a mock kotaci. Tlačítko s ikonou
obnovení v hlavičce vrátí demo do výchozího stavu.
