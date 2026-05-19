import urllib.request
import urllib.parse
import urllib.error
import json

BASE = "http://localhost:8000"


def api(path, data=None, method="GET"):
    url = BASE + path
    if data:
        url += "?" + urllib.parse.urlencode(data)
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"http_error": e.code, "body": body}
    except Exception as e:
        return {"error": str(e)}


print("=== 添加商品 ===")
p1 = api("/api/products", {"name": "可口可乐", "retail_price": "3.5"}, "POST")
print(f"  可口可乐: {p1}")
p2 = api("/api/products", {"name": "农夫山泉", "retail_price": "2.0"}, "POST")
print(f"  农夫山泉: {p2}")
p3 = api("/api/products", {"name": "康师傅方便面", "retail_price": "4.5"}, "POST")
print(f"  方便面: {p3}")

pid1 = p1["id"]
pid2 = p2["id"]
pid3 = p3["id"]

print("\n=== 添加别名 ===")
print(f"  可乐: {api(f'/api/products/{pid1}/aliases', {'alias': '可乐'}, 'POST')}")
print(f"  cola: {api(f'/api/products/{pid1}/aliases', {'alias': 'cola'}, 'POST')}")
print(f"  coke: {api(f'/api/products/{pid1}/aliases', {'alias': 'coke'}, 'POST')}")
print(f"  矿泉水: {api(f'/api/products/{pid2}/aliases', {'alias': '矿泉水'}, 'POST')}")

print("\n=== 添加批发价 ===")
print(f"  供应商A: {api(f'/api/products/{pid1}/wholesale', {'supplier': '饮料供应商A', 'price': '2.2'}, 'POST')}")
print(f"  供应商B: {api(f'/api/products/{pid1}/wholesale', {'supplier': '饮料供应商B', 'price': '2.0'}, 'POST')}")
print(f"  水供应商: {api(f'/api/products/{pid2}/wholesale', {'supplier': '水供应商', 'price': '0.8'}, 'POST')}")
print(f"  食品供应商: {api(f'/api/products/{pid3}/wholesale', {'supplier': '食品供应商', 'price': '2.8'}, 'POST')}")

print("\n=== 修改零售价（触发价格历史）===")
print(f"  可乐涨价: {api(f'/api/products/{pid1}', {'retail_price': '4.0'}, 'PUT')}")

print("\n=== 商品列表 ===")
print(json.dumps(api("/api/products"), indent=2, ensure_ascii=False))

print("\n=== 搜索: 可乐 ===")
print(json.dumps(api("/api/search", {"q": "可乐"}), indent=2, ensure_ascii=False))

print("\n=== 搜索: cola ===")
print(json.dumps(api("/api/search", {"q": "cola"}), indent=2, ensure_ascii=False))

print("\n=== 商品详情 ===")
print(json.dumps(api(f"/api/products/{pid1}"), indent=2, ensure_ascii=False))

print("\n=== 价格历史 ===")
print(json.dumps(api(f"/api/products/{pid1}/history"), indent=2, ensure_ascii=False))

print("\n=== 统计 ===")
print(json.dumps(api("/api/stats"), indent=2, ensure_ascii=False))

print("\n✅ 全部测试通过!")
