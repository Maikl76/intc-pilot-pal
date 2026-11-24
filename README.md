# Intel Pilot

Česká aplikace pro rozhodování o akciích Intel (NASDAQ: INTC), cvičné obchodování, dohledatelné zprávy a kontrolu rizika. Navazuje na původní projekt `intc-pilot-pal` v Lovable. Neprovádí skutečné pokyny brokerovi.

## Co lze dělat

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
