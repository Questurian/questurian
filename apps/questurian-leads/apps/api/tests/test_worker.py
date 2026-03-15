from __future__ import annotations

import unittest
from unittest.mock import patch

from rq import SimpleWorker, Worker

import worker as worker_module


class WorkerSelectionTests(unittest.TestCase):
    def test_get_worker_class_uses_simple_worker_on_macos(self) -> None:
        with patch("worker.platform.system", return_value="Darwin"):
            self.assertIs(worker_module._get_worker_class(), SimpleWorker)

    def test_get_worker_class_uses_standard_worker_elsewhere(self) -> None:
        with patch("worker.platform.system", return_value="Linux"):
            self.assertIs(worker_module._get_worker_class(), Worker)
