import copy
import json
import tempfile
import unittest
from pathlib import Path
from clipfleet.engine import discover_links, describe_campaign, score, make_script, make_video, ffmpeg_exists, make_video, write_json, load_json

CID='5ad699cd-7aed-44f7-9b57-489fdd6e2628'

class ClipFleetTests(unittest.TestCase):
    def test_find_real_campaign_link_formats(self):
        self.assertEqual(len(discover_links([f'<a href="/c/campaigns/{CID}">join</a>', f'https://contentrewards.com/c/campaigns/{CID}'])),1)
        self.assertEqual(len(discover_links([f'https:\\/\\/contentrewards.com\\/c\\/campaigns\\/{CID}'])),1)
    def test_campaign_extract_and_score(self):
        candidate={'id':CID,'url':'https://contentrewards.com/c/campaigns/'+CID}
        doc='<h1>Brand Product Promo</h1><main>Accepting clips Per approved post $10.00 Budget $0 / $1,000 $1,000 remaining</main>'
        c=describe_campaign(candidate,doc)
        self.assertEqual(c['model'],'per_post')
        self.assertEqual(c['rate'],10.0)
        self.assertEqual(c['budget_remaining'],1000.0)
        self.assertTrue(c['accepting'])
        self.assertFalse(c['verified_eligibility'])
        self.assertGreater(score(c)['priority_score'],0)
        self.assertEqual(score({**c,'accepting':False})['priority_score'],0)
    def test_no_rights_fail_closed(self):
        job={'campaign_id':CID,'verified_eligibility':False,'assets_licensed':False,'allows_original_graphic':True}
        with self.assertRaises(ValueError): make_video(job,Path('out.mp4'))
    def test_only_supported_script_claims(self):
        x=make_script({'product_name':'Shop Demo','approved_value_prop':'Orders arrive in a messaging app','approved_cta':'See the campaign'},1)
        self.assertEqual(x[0],'Paid promotion')
        self.assertIn('Orders arrive',x[2])
    def test_original_graphics_full_video(self):
        if not ffmpeg_exists(): self.skipTest('ffmpeg not installed')
        with tempfile.TemporaryDirectory() as tmp:
            job={'campaign_id':CID, 'verified_eligibility':True, 'assets_licensed':True,'brief_reviewed':True,
            'allows_original_graphic':True,'product_name':'Demo only','approved_value_prop':'This is a synthetic test','approved_cta':'No live promotion','duration_seconds':15}
            result=make_video(job,Path(tmp)/'test.mp4',0)
            self.assertTrue(Path(result['path']).exists())
            self.assertGreater(Path(result['path']).stat().st_size,25000)
            self.assertLess(abs(result['duration_seconds']-15),1)
            self.assertEqual(result['submission_status'],'not_submitted')
    def test_json_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'data.json'
            write_json(dest,{'a':123})
            self.assertEqual(load_json(dest),{'a':123})

if __name__=='__main__': unittest.main()
