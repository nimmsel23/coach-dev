import sys
import uuid
from fuel.db.database import SessionLocal
from fuel.db.models.journal import DailyJournal
from fuel.core.llm import extract_macros_from_text
from fuel.migrate import migrate
from datetime import date, datetime, timezone

def initialize_database():
    migrate()

def add_meal(user_input: str):
    print(f"Analysiere: '{user_input}' ...")
    
    try:
        meal_entry = extract_macros_from_text(user_input)
    except Exception as e:
        print(f"Fehler bei der Gemini-API: {e}")
        return

    print("\n--- Analyse Ergebnis ---")
    print(f"Name: {meal_entry.name}")
    print(f"Beschreibung: {meal_entry.description}")
    print(f"Kalorien: {meal_entry.macros.calories} kcal")
    print(f"Protein: {meal_entry.macros.protein}g | Carbs: {meal_entry.macros.carbs}g | Fett: {meal_entry.macros.fat}g")
    if meal_entry.ingredients:
        print("\nZutaten:")
        for ing in meal_entry.ingredients:
            print(f"- {ing}")
            
    initialize_database()
    db = SessionLocal()
    try:
        target_date = date.today().isoformat()
        journal = db.query(DailyJournal).filter(DailyJournal.date == target_date).first()
        if journal is None:
            journal = DailyJournal(date=target_date, food_logs=[], habits=[], notes=[], micros_sum={})
            db.add(journal)
        journal.food_logs = journal.food_logs or []
        journal.micros_sum = journal.micros_sum or {}

        now = datetime.now(timezone.utc).isoformat()
        meal = {
            "id": f"meal_{uuid.uuid4().hex}",
            "original_text": user_input,
            "name": meal_entry.name,
            "description": meal_entry.description,
            "ingredients": meal_entry.ingredients,
            "calories": meal_entry.macros.calories,
            "kcal": meal_entry.macros.calories,
            "protein": meal_entry.macros.protein,
            "carbs": meal_entry.macros.carbs,
            "fat": meal_entry.macros.fat,
            "fiber": meal_entry.macros.fiber,
            "sugar": meal_entry.macros.sugar,
            "micros": {
                key: value for key, value in meal_entry.micros.model_dump().items()
                if value is not None
            },
            "logged_at": now,
            "time": now,
        }
        journal.food_logs.append(meal)
        for key, value in meal["micros"].items():
            if value:
                journal.micros_sum[key] = journal.micros_sum.get(key, 0) + value
        db.commit()
        print(f"\n✅ Erfolgreich in der Datenbank gespeichert (Log ID: {meal['id']})")
    except Exception as e:
        print(f"\n❌ Datenbank-Fehler: {e}")
    finally:
        db.close()

def main():
    if len(sys.argv) < 2:
        print("Verwendung: poetry run python main.py 'Ich habe 200g Lachs mit 150g Reis und Brokkoli gegessen'")
        sys.exit(1)
        
    user_input = " ".join(sys.argv[1:])
    add_meal(user_input)

if __name__ == "__main__":
    main()
