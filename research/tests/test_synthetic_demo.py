import unittest
import numpy as np
from research.train_synthetic_demo import fit_synthetic_demo
from research.feature_engineering import FEATURES

class DemoReproducibility(unittest.TestCase):
    def test_reproducible_synthetic_export(self):
        first,second=fit_synthetic_demo(),fit_synthetic_demo()
        self.assertEqual(first,second)
        self.assertEqual(first["training_data"],"synthetic_demo_only")
        self.assertEqual(first["features"],FEATURES)
        self.assertEqual(first["samples"],1800)
        self.assertEqual(first["classes"],[1,2,3,4,5])
