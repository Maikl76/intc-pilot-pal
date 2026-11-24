# INTC Trading Pilot 2.0

Český nástroj pro analýzu a **PAPER simulaci**, nikoli automatické obchodování. Žádné skutečné pokyny Trading 212 ani jinému brokerovi. Větev 2.0 používá nový izolovaný stav prohlížeče; starý lokální stav se automaticky nepřepisuje ani nemigruje.

## Výchozí experiment
- Dlouhodobá evidence: rozpočet 300 000 Kč, množství a průměr zadává uživatel. Není zdrojem PAPER hotovosti.
- PAPER: 200 000 Kč, tranše nejvýše 50 000 Kč, rezerva 50 000 Kč, max. 3 pozice, modelový kurz 22,38 CZK/USD.
- Jeden vstup za hlavní seanci; pokles 1 USD od otevření; do 11:30 New York; +1 USD target, −1,50 USD stop, ukončení do konce stejné seance; nepřidávat při záporném gapu alespoň 5 %. Odhad nákladů 0,02 USD/akcii/stranu.
- PAPER risk lock při poklesu od špičky 10 000 Kč, ruční potvrzení každého simulovaného nákupu/prodeje. Odemknutí nemaže dosažený drawdown; otevřené pozice lze zavírat i při locku.
- Vše jsou nastavitelné hypotézy, ne ověřené doporučení.

## Použití
1. Trading: aktuální kotace a kontrola pravidel. Pokud zdroj chybí nebo je kotace starší než 90 s, nové PAPER obchody jsou blokovány. Historický graf je výslovně označen. Aplikace nesleduje trh při vypnutém prohlížeči; stop ani časový signál nic automaticky neprovedou. Rebound z uzavřených svíček a vícedenní pevné časové výstupy jsou zatím jen v backtestu.
2. Backtest: nahraj 1min/5min OHLC CSV nebo ZIP (např. oba exporty v INTEL_DATA.zip). Časové pásmo musí být obsaženo v timestampu. Limit 30 MB. Vyber řadu a období; nepřekrývej 1min a 5min řady. Použij pouze Intel data. Spusť pevnou strategii nebo 1 728 variant v chronologickém train/test rozdělení. Výpočet běží lokálně ve Web Workeru. Optimalizace omezuje rozsah na 250 seancí.
3. Historie: import Trading 212 CSV, pouze nákupy/prodeje INTC v USD, broker Result po měnách a FX poplatky samostatně, pomocné sousední BUY/SELL dvojice, test dosažení cíle po skutečných vstupech a export CSV. Data zůstávají v paměti prohlížeče, po obnovení je potřeba import opakovat. Import nesynchronizuje stav účtu.
4. Nastavení: dlouhodobá evidence a PAPER parametry. Změna rozpočtu sama nepřipíše virtuální peníze; reset PAPER účtu vyžaduje potvrzení. Nastavení, dlouhodobá evidence a PAPER historie se ukládají do localStorage tohoto zařízení (není šifrovaný trezor).

## Datový zdroj
Na serveru nastav **MARKET_DATA_API_KEY** (Finnhub). API klíče nikdy nedávej do kódu, veřejného repozitáře ani prohlížeče. Používá se čas kotace od poskytovatele, nikoli čas HTTP odpovědi. Chybějící nebo opožděná data nejsou nahrazena mock cenou. Kvalita a prodleva závisí na tarifu. Verze 2 nemá autentizovanou broker integraci; nepovolovat LIVE a nevkládat broker klíče pro tuto verzi. Původní nevyužité moduly jsou zachovány v repozitáři kvůli kompatibilitě, ale starý endpoint submitOrder LIVE vždy odmítne.

## Metodika
- Backtest počítá hlavní úplné 390minutové seance (America/New_York, DST); neúplné a zkrácené dny vynechává. Všechny chybějící dny nelze bez kalendáře detekovat. Nejde o tick replay.
- Limit nebo lepší open při vstupu; stop nebo horší open po gapu; při současném zásahu stopu/cíle konzervativně stop; žádný take-profit ve vstupní svíčce. Při odrazu signál až na close, nákup nejdříve v následující svíčce. Bez modelu fronty, hloubky trhu a skluzu.
- Celé kusy, fixní náklady na akcii na každé straně, hotovost, rezerva a limit vázaného kapitálu. Otevřená pozice je oceněna posledním close minus předpokládané likvidační náklady. Kontroluje se identita equity a realizovaného/nerealizovaného P/L.
- Drawdown je z close každé svíčky; denní drawdown zvlášť. Historický model neaplikuje PAPER risk lock. Skutečná výše rizika může být vyšší.
- Train skóre: P/L minus 0,5 × max. drawdown; alespoň 5 vstupů. Vybraný model se vyhodnotí jednou na pozdějším období, znovu od stejného počátečního kapitálu. Celé období je popisné, nikoli nezávislé ověření. Opakovaný výběr podle testu z něj dělá trénink. Výsledky nejsou záruka budoucích výnosů.
- Diagnostika skutečných nákupů ignoruje vstupní svíčku, vyžaduje úplný horizont. Test high ≥ target není důkaz skutečného plnění nebo výsledku prodeje.

## Vývoj a ověření
```sh
npm install
npm run test:pilot
npm run build
npm run dev
```
Jednotkové testy jsou v tests/pilot-engine.test.mjs. Před nasazením vyzkoušej upload obou datových řad, import výpisu, simulaci, exporty a chování bez klíče/po uzavření trhu. Osobní data ani cenové exporty se do repozitáře neukládají.
