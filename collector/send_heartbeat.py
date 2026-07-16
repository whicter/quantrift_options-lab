from __future__ import annotations

import os
import platform
import socket
from typing import Any

import requests
from dotenv import load_dotenv


load_dotenv()


def heartbeat_payload() -> dict[str, Any]:
    return {
        'node_id': os.getenv('HEARTBEAT_NODE_ID', socket.gethostname()).strip(),
        'payload': {
            'runtime': 'pm2',
            'collector': 'quantrift-options-collector',
            'platform': platform.system().lower(),
            'python': platform.python_version(),
        },
    }


def run() -> str:
    url = os.getenv('HEARTBEAT_URL', '').strip()
    token = os.getenv('HEARTBEAT_TOKEN', '').strip()
    if not url or not token:
        return 'disabled'
    response = requests.post(
        url,
        json=heartbeat_payload(),
        headers={'Authorization': f'Bearer {token}'},
        timeout=float(os.getenv('HEARTBEAT_TIMEOUT_SECONDS', '10')),
    )
    response.raise_for_status()
    return 'sent'


if __name__ == '__main__':
    print(run())
