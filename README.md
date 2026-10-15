# Riftbound Vault v4

## Novità
- Ricerca nel catalogo anche attraverso i tag (`tags`): digitando `Ahri` vengono trovate le carte che hanno il tag Ahri, comprese le Legend con un titolo differente come **Nine-Tailed Fox**.
- Fonte primaria aggiornata: dataset `Wysme/riftbound-cards` su Hugging Face (`cards.json`), alimentato dal catalogo Riot e aggiornato a ottobre 2026. Fonte alternativa: release GitHub `LouisCourrian/riftbound-cards`; fallback ultimo: `slimtreble/Riftbound-card-data` (non contiene Radiance).
- Supporto alle carte Radiance già pubblicate, distinguendo le stampe attraverso gli identificativi. Radiance non è ancora stata pubblicata fisicamente alla data della presente versione, 16 ottobre 2026: la copertura dipende dalle anteprime disponibili e dall'aggiornamento del dataset.
- Stato del catalogo indica numero delle stampe Radiance. Il catalogo viene aggiornato una volta all'installazione v4 e successivamente con il tasto «Aggiorna catalogo».
- Nessun caricamento foto né inserimento del prezzo unitario, come nella v3.

## Sicurezza dati
IndexedDB mantiene invariato il nome `riftbound-vault` e lo store `loans`, senza operazioni di cancellazione durante gli aggiornamenti. Il catalogo `catalog` è indipendente dai prestiti. Per sicurezza, esportare il backup prima dell'aggiornamento. Non cancellare i dati del sito o cambiare l'URL della PWA.

## Avvio
Apri `index.html` tramite Live Server di VS Code o pubblica nella stessa destinazione GitHub Pages dell'app precedente. Serve connessione internet per il download del catalogo e delle immagini. La sorgente esterna può essere soggetta a restrizioni di rete/CORS; il messaggio di errore appare sotto «Catalogo Riftbound».

## Controlli consigliati
1. Cerca `Ahri` con il filtro «Leggende (Legend)» e verifica che compaia **Nine-Tailed Fox**; togli il filtro per vedere anche le unità.
2. Filtra «Radiance», controlla il conteggio e cerca `RAD-001`.
3. Registra un prestito, aggiorna l'app e controlla che sia ancora presente. Verifica lo storico delle restituzioni.

## Limiti test
Verificata la sintassi JS e il pacchetto ZIP localmente; non è stato possibile testare direttamente l'interazione live del browser con tutte le sorgenti esterne o la PWA su iPhone.
