"""Fast offline tests: no OpenRouter key, browser access or downloads required."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "clipfleet_openrouter_agent",
    Path(__file__).resolve().parents[1] / "scripts" / "local_openrouter_agent.py",
)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

class OpenRouterLocalAgentTests(unittest.TestCase):
    def test_only_zero_cost_model_ids_accepted(self):
        self.assertTrue(agent.free_model("openrouter/free"))
        self.assertTrue(agent.free_model("some-provider/some-model:free"))
        for name in ("", "gpt-4", "openrouter/auto", "anthropic/claude-sonnet-4-6",
                     "meta-llama/llama:extended", "/openrouter/free"):
            self.assertFalse(agent.free_model(name), msg=name)
    def test_campaign_url_restrictions(self):
        url="https://contentrewards.com/c/campaigns/5ad699cd-7aed-44f7-9b57-489fdd6e2628"
        self.assertEqual(agent.campaign_url(url),url)
        for bad in ("https://evil.com/c/campaigns/a","http://contentrewards.com/c/campaigns/a",
                    "https://contentrewards.com.evil.com/c/campaigns/a",
                    "https://contentrewards.com/login",
                    "https://user:pass@contentrewards.com/c/campaigns/a"):
            with self.assertRaises(ValueError):
                agent.campaign_url(bad)

if __name__ == "__main__":
    unittest.main()
