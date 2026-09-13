# catalog/kb
Beim Frontend-Build werden alle ymls klientsetig importiert.
Dies soll app-geschwindigkeit erhöhen wie auch firestore-quota schonen & offline-verwendbarkeit vereinfachen.


# /muscles/*
sind immer nach deren physischer Größe geordnet von groß nach klein.
Muskel-Komplexe wie Quadrizeps steht Synonym für dessen Köpfe bzw Anteile die zusätzlich mit a/b/c/d nummeriert und nur der vollständigkeitshalber vorhanden.
ein Muskel mit mehreren Anteilen wie zB M. deltoideus ist mit 301_deltoideus findbar, seine Anteile zB als 301a_deltoideus_pars_acromialis bzw 301a_deltoideus_anterior.
Für die meisten App-Funktionen werden die Member nicht verwendet sondern deren Parent.

Jede grobe Körperregion hat einen von 7 ordnern welcher synomym für die jeweilige Region steht. 
Jeder ordner hat eine bucket.yml im muscles ordner selbst welche wiederum, zusätzlich zur muscles_index.yml, den jeweiligen ordner indexiert.


# /exercises
Sinn dahinter sollte sein pro exercise eine spezifische nummerische id xxx.yml zu haben anstatt dieser generischen Dateinamen.
beim Loggen einer exercise in einem Workout wird per default wenn es eine unreviewed-exercise (aus wger bzw yuhona db) ist ein draft in der inbox erstellt.
Diese Inbox soll dem Coach dienen die informationen zu den exercises zu approven bevor sie als expert-approved gelten.
021.yml usw, welche nun nur noch als .bak existieren, folgten einem bestimmten nummerischem system welches sehr logisch wäre.

Im weiteren solle ein push.js pull.js und legs.js anhand der approvten exercises beim Frontend-build erstellt werden damit es wieder clientseitig verbaut ist wie auch schon die unreviewed exercises es sind. 

Wenn ein inbox draft erstellt wird soll es mit den source-ids aus wger+yuhona verknüpft werden damit jene unreviewed exercises ab dann clientseitig verschwinden können.
