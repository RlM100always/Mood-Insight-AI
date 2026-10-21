import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]

class AustraliaDataTests(unittest.TestCase):
    def test_mobile_and_backend_data_match(self):
        official=json.loads((ROOT/'research/data/nsmhw_2020_2022.json').read_text())
        mobile=json.loads((ROOT/'mobile/src/data/australian_nsmhw.json').read_text())
        self.assertEqual(official,mobile)
        self.assertEqual(len(official["age_groups"]),7)
        self.assertAlmostEqual(official["age_groups"][0]["persons"],38.8)
        self.assertEqual(len(official["disorder_groups"]),4)
        self.assertTrue(official["source_url"].startswith("https://www.abs.gov.au/"))
        self.assertTrue(any("daily mood" in x for x in official["unsuitable_for"]))

if __name__=="__main__":
    unittest.main()
