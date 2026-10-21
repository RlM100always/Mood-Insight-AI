"""Participant splitting must not leak the same person across train and test.

The fixture is synthetic just for a unit test; NO fabricated human-level metric
is treated as a study result.
"""
import unittest
import numpy as np
from sklearn.model_selection import GroupShuffleSplit

class GroupLeakageTests(unittest.TestCase):
    def test_group_shuffle_split_separates_participants(self):
        ids=np.array([f"p{i:03d}" for i in range(12)])
        training,heldout=next(GroupShuffleSplit(n_splits=1,test_size=.2,random_state=42).split(ids,groups=ids))
        self.assertFalse(set(ids[training]) & set(ids[heldout]))
        self.assertEqual(len(training)+len(heldout),len(ids))
    def test_source_passes_required_group_parameter(self):
        from pathlib import Path
        root=Path(__file__).resolve().parents[1]
        for name in ("export_mobile_model.py","model_lab.py"):
            source=(root/name).read_text()
            self.assertIn(".split(ids, groups=ids)", source,
                          f"{name} must use participant groups to prevent leakage")

if __name__=="__main__":
    unittest.main()
