"""Unit tests for safe Grok Bot routine dispatcher."""
import importlib.util
import io
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('grokbot_dispatch',Path(__file__).resolve().parents[1]/'scripts/dispatch_grokbot.py')
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class GrokBotDispatchTests(TestCase):
    def test_webhook_requires_https_host_without_credentials(self):
        self.assertTrue(bridge.valid_webhook('https://hooks.example.org/v1/inbound'))
        for url in ['http://hooks.example.org/','https://person:pw@host.com/','ftp://host.example/x',
                    'https://localhost/','https://127.0.0.1/']:
            self.assertFalse(bridge.valid_webhook(url))

    def test_webhook_contains_no_internal_admin_secrets_or_publisher_credentials(self):
        task={
          'id':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          'job_id':'11111111-2222-3333-4444-555555555555',
          'campaign_id':'66666666-7777-8888-9999-aaaaaaaaaaaa',
          'campaign_url':'https://contentrewards.com/c/campaigns/66666666-7777-8888-9999-aaaaaaaaaaaa',
          'actions_run_url':'https://github.com/amiddlebrook/Clipfleet/actions/runs/39831992156',
          'output_sha256':'0'*64
        }
        captured={}
        class FakeResponse:
            status=200
            def __enter__(self):return self
            def __exit__(self,*_):return False
        def capture(request,timeout):
            captured['headers']=dict(request.header_items())
            captured['body']=json.loads(request.data)
            return FakeResponse()
        with patch.object(bridge,'WEBHOOK','https://routine.example.org/webhook'),patch.object(bridge,'KEY','BOT-SENDER-SECRET'),patch('urllib.request.urlopen',side_effect=capture):
            self.assertEqual(bridge.send_task(task),200)
        self.assertEqual(captured['headers']['Authorization'],'Bearer BOT-SENDER-SECRET')
        self.assertEqual(captured['body']['event'],'clipfleet.review_ready.v1')
        self.assertEqual(captured['body']['task_id'],task['id'])
        text=json.dumps(captured['body'])
        self.assertNotIn('BOT-SENDER-SECRET',text)
        self.assertNotIn('CLIPFLEET_ADMIN_TOKEN',text)
        self.assertEqual(captured['body']['approval_required_for'][0],'publication')
