import unittest
from copy import deepcopy
from plan_delivery import _publish

class Snap:
    def __init__(self,value): self.exists = value is not None; self.value = value
    def to_dict(self): return deepcopy(self.value)
class Ref:
    def __init__(self, records, path): self.records=records; self.path=path
    def get(self,transaction=None): return Snap(self.records.get(self.path))
    def collection(self,name): return Ref(self.records,self.path+'/'+name)
    def document(self,name): return Ref(self.records,self.path+'/'+name)
class Tx:
    def set(self,ref,value): ref.records[ref.path]=deepcopy(value)

class DeliveryTest(unittest.TestCase):
    def test_idempotent_snapshots_and_source_boundary(self):
        records={}; ref=Ref(records,'fitness/client/macrocycles/local-plan'); tx=Tx()
        payload={'planId':'local-plan','clientUid':'client','source':'coach-local-plan','localVersion':1,'snapshot':{'name':'First','description':'','totalWeeks':8,'routines':[]}}
        first=_publish(tx,ref,payload)
        self.assertEqual(first['version'],1)
        self.assertTrue(_publish(tx,ref,payload)['unchanged'])
        second=_publish(tx,ref,{**payload,'localVersion':2,'snapshot':{**payload['snapshot'],'name':'Second'}})
        self.assertEqual(second['version'],2)
        self.assertEqual(records[ref.path+'/versions/v1']['snapshot']['name'],'First')
        self.assertEqual(records[ref.path]['published']['name'],'Second')
        records[ref.path]['source']='another-owner'
        with self.assertRaises(ValueError): _publish(tx,ref,payload)

if __name__=='__main__': unittest.main()
