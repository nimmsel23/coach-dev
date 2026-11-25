from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from src.fuel_recipe_catalog import save_recipe, list_recipes

class RecipeCatalogTest(unittest.TestCase):
    def test_deduplicates_without_merging_variants_or_keeping_client_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'catalog.sqlite3'
            value={'recipe':{'name':'Erdäpfelpfanne','ingredients':['300 g Erdäpfel'],'steps':['Garen.'],'minutes':25,'servings':1,'clientUid':'private'},'clientUid':'private','model':'test'}
            a=save_recipe(value,db);b=save_recipe(value,db)
            self.assertEqual(a['id'],b['id']);self.assertFalse(b['created'])
            values=list_recipes('Erdäpfel',db)
            self.assertEqual(values[0]['seenCount'],2)
            self.assertNotIn('private',str(values))
            value['recipe']['ingredients']=['350 g Erdäpfel']
            self.assertNotEqual(a['id'],save_recipe(value,db)['id'])
            self.assertEqual(len(list_recipes('',db)),2)
    def test_concurrent_writers_preserve_one_content_addressed_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'catalog.sqlite3'
            value={'recipe':{'name':'Hendl','ingredients':['Hendl'],'steps':['Garen.'],'minutes':20,'servings':1}}
            save_recipe(value,db)
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda _:save_recipe(value,db),range(8)))
            self.assertEqual(list_recipes('',db)[0]['seenCount'],9)

if __name__=='__main__':unittest.main()
