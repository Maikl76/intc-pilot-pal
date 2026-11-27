# Intel Pilot

Česká aplikace pro rozhodování o akciích Intel (NASDAQ: INTC), cvičné obchodování, dohledatelné zprávy a kontrolu rizika. Navazuje na původní projekt `intc-pilot-pal` v Lovable. Neprovádí skutečné pokyny brokerovi.

## Co lze dělat

- **Prognóza výdělku:** rozpětí ceny a hodnoty dlouhodobé pozice na 1 týden až 1 rok se zpětnou kontrolou na 10 letech historie INTC; denní obchodování porovnané s náhodou (úspěšnost a průměr na akcii s intervaly, test proti náhodným nákupům, potřebný počet obchodů); souhrn obou částí kapitálu; rozbor skutečných obchodů z výpisu Trading 212, který se počítá jen v prohlížeči.
- **Plán a signály:** postupy profesionálních obchodníků dostupné drobnému investorovi: velikost pozice podle rizika (stop podle ATR, riziko v % kapitálu, cíl v násobcích rizika, denní limit, dopad přikoupení ve ztrátě), známé obchodní signály z odborné literatury živě přezkoušené na historii INTC s verdiktem a kontrola nákladů provedení.
- **Obchodní přehled:** skutečná poslední dostupná cena, čas pozorování a zdroj, stav seance, minutový graf, diagnostika výpadků a volitelný samostatný graf TradingView.
- **Tržní cvičení:** ruční virtuální nákup a celý/částečný prodej podle použitelné tržní kotace. Výsledky zahrnují zadané modelové náklady.
- **Vlastní scénář:** samostatný virtuální účet s ručně nastavenou, jednoznačně fiktivní cenou. Funguje i bez datového zdroje nebo mimo burzovní hodiny. Nesdílí pozice ani výsledky s tržním cvičením.
- **Zprávy a důkazy:** titulky Intel IR, přehled podání SEC přes Intel IR, volitelně média přes Finnhub. Původní čas, odkaz, typ zdroje a filtrování. Vlastní poznámky k 18A, 14A, Foundry a financím.
- **Riziko a scénáře:** kapitál, čistý výsledek cíle, ztráta na stopu, nutná úspěšnost a citlivost na pokles ceny. Srovnání uzavřené seance INTC/SOXX/QQQ, průměr true range, historická volatilita a relativní objem.
- **Historie:** lokální import Trading 212 CSV s oddělenými měnami brokerova výsledku a FX poplatků; cvičné dílčí výstupy s původem cen; CSV export.
- **Backtest:** import 1min/5min OHLC CSV nebo ZIP, pevná strategie, 1 728 variant s chronologickým rozdělením, náklady, otevřené pozice a propad účtu.
- **Nastavení a záloha:** dlouhodobá evidence, limity, oddělený reset aktivního cvičného účtu, validovaná JSON záloha obou účtů.

## První cvičení

1. Otevři Obchodní přehled. U tržní ceny zkontroluj zdroj a její skutečný čas.
2. Pro okamžité seznámení vyber **Vlastní scénář**. Výchozí cena 57 USD je fiktivní, nikoli odhad trhu.
3. Zadej počet kusů, který se vejde do limitu tranše, a cvičně nakup.
4. Tlačítkem **Cena +1 USD** změň scénář. U otevřené pozice zvol **Cvičně prodat**, případně prodej jen část.
5. V Historii se zobrazí samostatný výsledek scénáře. Pro tržní cvičení přepni zpět na jeho účet.

Příklad: 80 akcií × (58 − 57) = 80 USD hrubého. Při modelových nákladech 0,02 USD na kus za každou stranu je čistý výsledek 76,80 USD. Aby se nákup 80 kusů při 57 USD vešel do tranše, je třeba zohlednit kapitál, modelový kurz a náklady; výchozí tranše 50 000 Kč na takový nákup nestačí. Limity lze před cvičením upravit v Nastavení.

## Výchozí pravidla jsou experiment

- Dlouhodobý plán 300 000 Kč; počet a průměr se vyplňují ručně. Nula znamená nezadanou evidenci, nikoli odhad skutečného účtu.
- Každý cvičný účet začíná s 200 000 Kč přepočtenými modelovým kurzem 22,38 CZK/USD. Při nákupech/prodejích pracuje s USD.
- Tranše nejvýše 50 000 Kč, rezerva 50 000 Kč, nejvýše tři otevřené pozice.
- Výchozí cíl +1 USD na akcii, stop −1,50 USD, modelové náklady 0,02 USD na akcii a stranu. Náklady nejsou deklarovaným sazebníkem Trading 212.
- Volitelná přísná strategie: pokles 1 USD od otevření, nákup do 11:30 New York, nejvýše jeden vstup denně, filtr záporného gapu 5 %, denní časový výstup.
- Ochrana před dalším propadem 10 000 Kč. Blokuje nákupy, dovoluje prodeje. Vědomé odemčení nastaví novou ochrannou referenci; celková historická ztráta a maximální zaznamenaný propad se nemažou.

Stop, cíl i časový výstup jsou upozornění pro ruční potvrzení. Aplikace při zavřeném prohlížeči nesleduje ceny, neplní pokyny a neposílá upozornění. Návrat ceny ani zisk nejsou zaručené.

## Datové zdroje a jejich omezení

### Kotace

Server zkouší dva pevné Yahoo Finance chart endpointy. Volitelně použije Finnhub, pokud je v hostingu nastavena serverová proměnná `MARKET_DATA_API_KEY`. Klíče se nikdy neposílají do prohlížeče, záloh ani veřejného GitHubu.

- Obnova přibližně po 15 s při otevřené aplikaci, serverová krátká cache.
- Při výpadku se uchová původní čas posledního úspěšného pozorování; žádná vymyšlená náhradní cena.
- Ruční tržní cvičení vyžaduje cenu stejného dne a stejné seance, nejvýše 20 minut starou. Jde o model podle dostupného pozorování, nikoli garantované živé plnění.
- Přísná strategie vyžaduje hlavní seanci a cenu nejvýše 2 minuty starou. Uchovaná odpověď po selhání obnovy nebo podstatný rozpor mezi současnými zdroji ji nepovolí.
- Kalendář obsahuje publikované svátky a zkrácené seance Nasdaq pro rok 2026. Pro ostatní roky přísný režim vyžaduje datovanou seanci poskytovatele. Mimořádné uzavření burzy a individuální obchodní halty nejsou zaručeně rozpoznány.
- Yahoo rozhraní je neoficiální, bez garance dostupnosti a prodlevy. TradingView je samostatný graf a jeho data se nepoužívají jako cena pro cvičný pokyn.

### Zprávy

Primární zdroje: [Intel press releases RSS](https://www.intc.com/news-events/press-releases/rss), [Intel SEC filings RSS](https://www.intc.com/filings-reports/all-sec-filings/rss). Přehled podání je zrcadlo Intel IR; podání se ověřuje otevřením původního dokumentu. Firemní tvrzení není nezávislým ověřením technologie nebo zákaznického kontraktu. Témata se třídí podle titulků, bez generovaných investičních tvrzení.

Server obnovuje zdroje nejvýše jednou za 5 minut. Při výpadku zachová obsah maximálně 24 hodin a viditelně označí chybu zdroje. RSS má omezený rozsah; nejde o úplný archiv ani automatické posouzení významu události.

### Historický kontext

Denní OHLC INTC, SOXX a QQQ pochází z Yahoo Finance. Dnešní datum se úmyslně nezahrnuje ani po uzavření trhu. Srovnání vyžaduje shodný počáteční i koncový den výnosu; zastaralá poslední seance je označená. True range je prostý průměr 14 hodnot, bez Wilderova vyhlazení. Volatilita je výběrová směrodatná odchylka posledních 20 logaritmických výnosů × √252. Objem se srovnává s předchozími 20 seancemi. Mimořádný výnos se porovnává s 20 předcházejícími výnosy, bez zahrnutí posuzovaného dne. Tyto statistiky neprokazují manipulaci a nepředpovídají obrat.

## Úložiště a soukromí

Cvičné účty, nastavení a dlouhodobá evidence zůstávají v localStorage daného prohlížeče. Starý klíč `intc-pilot-v2-private` je zachován pro validovanou migraci do schématu v3. Neplatná data se nepřepíšou bez možnosti jejich stažení. Konflikt mezi okny se rozpozná před zápisem; nejde o transakční databázi nebo víceuživatelský broker systém.

JSON záloha obsahuje oba cvičné účty, nastavení a dlouhodobou evidenci. Importované cenové a transakční CSV zůstávají pouze v paměti a po obnově se znovu načítají. Poznámky ke zprávám mají samostatný klíč `intc-pilot-evidence-v1` a vlastní stažení JSON. Žádný osobní výpis není součástí veřejného repozitáře.

## Metodika backtestu

- Pouze úplné 390minutové hlavní seance; zkrácené a neúplné se vynechávají. Úplně chybějící obchodní dny nelze vždy odhalit.
- Vstup na limitu nebo lepším open; stop na limitu nebo horším open po gapu. Při současném zásahu stopu a cíle má přednost stop. Žádný ziskový target ve vstupní svíčce.
- Odraz se potvrzuje až uzavřenou svíčkou, vstupuje se nejdříve v další. Reportované časy jsou začátky svíček; délky držení jsou přibližné.
- Celé kusy, náklady obou stran, rezerva a limit vázaného kapitálu. Účetní identita hotovosti a realizovaného/nerealizovaného výsledku se kontroluje.
- Propad se měří z close každé svíčky, denní propad samostatně. Model nezná skutečnou frontu pokynů, order book ani maximální intrabar ztrátu. Cvičný risk lock není součástí historické optimalizace.
- 1 728 variant, tréninkové skóre P/L − 0,5 × propad, alespoň pět vstupů. Výběr z mnoha variant na krátkých datech se snadno přizpůsobí náhodě. Pět vstupů není důkaz výhody; opakované ladění podle testu z něj udělá součást výběru.
- Diagnostika dosažení cíle po skutečném nákupu ignoruje vstupní svíčku, vyžaduje úplný horizont; high nad cílem není důkaz skutečného plnění.

## Metodika prognózy

Prognóza ukazuje rozpětí a pravděpodobnosti, ne slib výsledku. Výpočty jsou v `src/lib/pilot-forecast.mjs` a `src/lib/pilot-review.mjs` (čisté funkce, testy se syntetickými daty se známým výsledkem). Náhodné převzorkování má pevné semínko: stejná data dávají stejný výsledek.

### Dlouhodobá část

- Model: ln(cena za t / dnešní cena) ~ N(μ·t, σ²·t), t v letech (252 obchodních dní). σ = výběrová směrodatná odchylka denních log výnosů z upravených závěrů (dividendy) za zvolené okno, výchozí posledních 252 dní, × √252. μ = předpoklad trendu zadaný uživatelem, výchozí 0 (medián = dnešní cena). Kurz USD/CZK je modelový z Nastavení a nemodeluje se.
- Zpětná kontrola: pro každý den historie se σ spočítá jen z předchozích dní, sestaví se 80% pásmo pro horizont a ověří se, zda skutečná cena skončila uvnitř (pokrytí). Směr: znaménko výnosu za poslední okno proti znaménku budoucího výnosu. Období se překrývají; nezávislých období je přibližně (počet dní − okno) / horizont.
- Ověření na skutečných datech INTC (stav k 25. 11. 2026): 80% pásmo s oknem 1 rok a nulovým trendem obsáhlo skutečnost v 80–83 % případů pro 1 týden až 3 měsíce a v 73–82 % pro 6–12 měsíců (2000–2026 i 2016–2026). Použití minulého trendu jako předpovědi pokrytí zhoršilo (u 6–12 měsíců na 55–63 %). Směr podle minulého roku vyšel ve 40–52 % případů, tedy nepředpovídá. Tlusté konce: 95% pásmo obsáhlo skutečnost jen ve 91–94 % případů.

### Denní obchodování

- Náhoda: u ceny bez trendu je pravděpodobnost dosažení cíle +a dřív než stopu −b rovna b / (a + b), pro +1/−1,5 USD tedy 60 %. Bez výhody je očekávaný výsledek obchodu −2 × náklady na akcii. Na 60 seancích 5min dat INTC (září–listopad 2026) měly náhodné vstupy se stejnými výstupy průměr −0,04 USD na akcii.
- Pravidla z Nastavení se přehrají enginem `run` (pouze úplné hlavní seance). Interval průměru na akcii: percentilový bootstrap (2 000 převzorkování). Interval úspěšnosti: Wilsonův.
- Test proti náhodě: 2 000× se vybere stejný počet různých dní, jako má pravidlo obchodů, v každém náhodná svíčka do konce vstupního okna; výstup kopíruje logiku `run` (shodu ověřuje test). p = (počet pokusů se stejným nebo lepším průměrem + 1) / 2 001.
- Orientační potřebný počet obchodů: ⌈(1,96 · SD / průměr)²⌉. Měsíční rozpětí: dvojí převzorkování denních výsledků (nejistota výhody i průběhu měsíce).
- Pravidla vybraná optimalizací na stejných datech vycházejí příliš dobře; posuzuj je na datech, která při výběru nebyla.

### Skutečné obchody

- Výpis Trading 212 se načítá stávajícím importem (jen BUY/SELL INTC v USD) a zůstává v paměti prohlížeče.
- Párování LIFO (prodej uzavře nejnovější nákup) dělí výsledek na prodané obchody a neprodané nákupy. Celkový výsledek = prodeje − nákupy + držené akcie × cena a na párování nezávisí. Průměrná cena držené pozice se počítá metodou průměru jako u brokera.
- Srovnání: nejvyšší kapitál vázaný v INTC, koupený za cenu prvního nákupu a držený do dneška. Poplatky za směnu měn a broker Result se uvádějí zvlášť podle měny.

### Data prognózy

Server čte Yahoo Finance chart API: denní OHLC 10 let (obnova po 6 h, při výpadku nejvýše 3 dny stará odpověď) a 5min svíčky hlavní seance za 60 dní (obnova po 15 min, při výpadku nejvýše 1 den stará). Rozhraní je neoficiální; chyba zdroje se zobrazí. Delší intradenní historii lze nahrát v Backtestu a vybrat v Prognóze.

## Metodika plánu a signálů

Výpočty jsou v `src/lib/pilot-edge.mjs` (čisté funkce, testy se syntetickými daty se známým výsledkem).

- **Velikost pozice:** riziko v USD = kapitál × riziko % ÷ kurz; ztráta na akcii = vstup − stop + 2 × náklady; počet akcií = ⌊riziko ÷ ztráta na akcii⌋, nejvýše kolik dovolí kapitál. Výchozí stop = vstup − 1 × ATR(14) z denních dat; cíl = vstup + R × (vstup − stop).
- **Kolísání:** 20denní volatilita proti mediánu 20denních volatilit za předchozí rok; násobek velikosti = obvyklá ÷ současná v mezích 0,25–1. Zpětné srovnání bez pohledu do budoucnosti.
- **Signály:** propad o 3 % / 5 % a víc a výnos dalších 5 dní (krátkodobý návrat, Lehmann 1990; události se nepřekrývají, bootstrap interval rozdílu proti běžnému týdnu); držení nad 200denním průměrem (obdoba Faber 2007); výnos přes noc proti dni (Lou, Polk, Skouras 2019); intradenní momentum (Gao, Han, Li, Zhou 2018) a průraz po první hodině (zjednodušení Zarattini, Barbon, Aziz 2024) na hodinových svíčkách za 2 roky. Verdikt „Výhoda“ jen při ≥ 30 případech a celém 95% intervalu nad nulou; u rizikových nástrojů „Snižuje riziko“, když klesne volatilita i největší propad.
- **Ověření na skutečných datech INTC (stav k 25. 11. 2026, data 10 let / 2 roky hodinových svíček):** žádný z návratových signálů neprokázal výhodu. Propad ≥ 3 %: +0,75 % proti běžnému týdnu, interval −0,59 až +2,16 %. Propad ≥ 5 %: −1,62 %, interval −3,29 až +0,07 %. Intradenní momentum: korelace 0,000. Průraz po první hodině: rozdíl −20 až +22 bp. Řízení podle kolísání snížilo největší propad z −71 % na −65 % a volatilitu z 51 % na 41 %; filtr 200denního průměru propad na −66 %. Výnos byl v obou případech o něco nižší.
- **Vynecháno záměrně:** posun ceny po výsledcích hospodaření u velkých firem vymizel (Martineau 2022); obchody insiderů mají hodnotu jen u neobvyklých nákupů (Cohen, Malloy, Pomorski 2012); očekávaný pohyb z opcí vyžaduje placená data (Yahoo options API vyžaduje přihlášení).
- **Kontext výzkumu:** méně než 1 % denních obchodníků na Tchaj-wanu bylo spolehlivě ziskových (Barber, Lee, Liu, Odean 2014); z Brazilců, kteří denně obchodovali přes 300 dní, prodělalo 97 % (Chague, De-Losso, Giovannetti 2020); investoři drží ztráty a prodávají zisky příliš brzy (Odean 1998). Úplný seznam odkazů je na stránce Plán a signály.

Hodinové svíčky čte serverová funkce `getIntelHourly` (Yahoo, 2 roky, obnova po hodině, při výpadku nejvýše den stará odpověď).

## Vývoj

Projekt používá existující Bun lockfile a Lovable TanStack Start konfiguraci.

```sh
bun install --frozen-lockfile
bun run test:pilot
bun run typecheck
bun run build
bun run dev
```

Testy pokrývají účetní identity, dílčí prodeje, náklady a rezervu, oddělení scénářů, migraci, čas kotace, předchozí závěr, spory zdrojů, seance, XML a odkazy zpráv a historické statistiky. Produkční sestavení generuje klienta i Cloudflare Worker server. Zachovej publikovanou historii Git; nepoužívej force push.

## Synchronizované ceny a noční seance
Vlastní graf, cena v záhlaví a tržní simulátor vycházejí z jedné vybrané kotace. Graf nemíchá ceny různých poskytovatelů; pokud zdroj nemá historii, začíná jediným skutečným pozorováním a postupně přidává další. Nezávislý vložený TradingView může používat jiný feed; neposkytuje API pro převzetí ceny. V noci (20:00–04:00 ET před obchodním dnem) může volitelně server číst Alpaca latest trades. Nastav APCA_API_KEY_ID a APCA_API_SECRET_KEY pouze jako serverové secrets. Výchozí feed overnight je odvozený a poslední obchod má podle dokumentace zpoždění 15 min. Nastavení ALPACA_OVERNIGHT_FEED=boats vyžaduje příslušný tarif a oprávnění. Ověř licenci pro publikování dat před zapnutím feedu na veřejné aplikaci. Bez klíčů se žádná noční cena nedopočítává; starší kotace je označená a nelze ji použít pro tržní cvičení mimo její seanci. Přísná strategie nadále platí jen v hlavní seanci. Kalendář nočního trhu je omezen na ověřený rok 2026. Oba cvičné účty i jejich historie zůstávají beze změny.
