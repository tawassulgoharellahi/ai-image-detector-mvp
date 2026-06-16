import json
from modelscope.hub.api import HubApi

api = HubApi()
try:
    files = api.get_dataset_files(repo_id='aemilia/AIGCDetectionBenchmark', recursive=True)
    print("Files in dataset:")
    for f in files:
        print(f"{f['Path']} ({f['Size']} bytes)")
except Exception as e:
    print("Error querying files:", e)
