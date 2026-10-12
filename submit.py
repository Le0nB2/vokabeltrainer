import urllib.request, json
req = urllib.request.Request('http://localhost:8000/tools/call', data=json.dumps({'name': 'submit', 'arguments': {}}).encode('utf-8'), headers={'Content-Type': 'application/json'})
print(urllib.request.urlopen(req).read().decode('utf-8'))
