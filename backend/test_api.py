import requests
url = "http://localhost:8000/api/detect"
files = {'file': ('test.jpg', open('test.jpg', 'rb'), 'image/jpeg')}
response = requests.post(url, files=files)
print(response.json())
