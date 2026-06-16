import gdown

url = "https://drive.google.com/drive/folders/1EntwW1d5nMDoKjcWi8XyVKnsHJpHRmtu?usp=sharing"
try:
    print("Querying Google Drive folder...")
    # This will just print the files in the folder without downloading them
    files = gdown.download_folder(url, skip_download=True, quiet=False)
    for f in files:
        print(f"Path: {f.path}, ID: {f.id}")
except Exception as e:
    print("Error querying Google Drive folder:", e)
