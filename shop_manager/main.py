from flask import Flask, request, jsonify, redirect, send_from_directory
from flask_cors import CORS
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
import os

from database import engine, SessionLocal, Base
from models import Product, Alias, WholesalePrice, PriceHistory

Base.metadata.create_all(bind=engine)

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)


def record_history(db: Session, product_id: int, field: str, old_val, new_val):
    if old_val != new_val:
        db.add(PriceHistory(
            product_id=product_id,
            field=field,
            old_value=old_val,
            new_value=new_val,
        ))


# ========== 商品管理 ==========

@app.route("/api/products", methods=["GET"])
def list_products():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    with SessionLocal() as db:
        total = db.query(Product).count()
        products = (
            db.query(Product)
            .order_by(Product.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        result = []
        for p in products:
            min_wholesale = None
            if p.wholesale_prices:
                min_wholesale = min(wp.price for wp in p.wholesale_prices)
            result.append({
                "id": p.id,
                "name": p.name,
                "retail_price": p.retail_price,
                "min_wholesale_price": min_wholesale,
                "profit": round(p.retail_price - min_wholesale, 2)
                    if (p.retail_price is not None and min_wholesale is not None) else None,
                "alias_count": len(p.aliases),
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            })
        return jsonify({"total": total, "page": page, "page_size": page_size, "items": result})


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        return jsonify({
            "id": p.id,
            "name": p.name,
            "retail_price": p.retail_price,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "aliases": [{"id": a.id, "alias": a.alias} for a in p.aliases],
            "wholesale_prices": [
                {"id": wp.id, "supplier": wp.supplier, "price": wp.price,
                 "created_at": wp.created_at.isoformat() if wp.created_at else None}
                for wp in p.wholesale_prices
            ],
        })


@app.route("/api/products", methods=["POST"])
def create_product():
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"detail": "商品名称不能为空"}), 400
    retail_price = request.args.get("retail_price", type=float)

    with SessionLocal() as db:
        product = Product(name=name, retail_price=retail_price)
        db.add(product)
        db.commit()
        db.refresh(product)
        return jsonify({"id": product.id, "name": product.name, "retail_price": product.retail_price})


@app.route("/api/products/<int:product_id>", methods=["PUT"])
def update_product(product_id):
    name = request.args.get("name")
    retail_price = request.args.get("retail_price", type=float)

    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404

        if retail_price is not None:
            record_history(db, product_id, "retail_price", p.retail_price, retail_price)
            p.retail_price = retail_price
        if name is not None:
            p.name = name

        p.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(p)
        return jsonify({"id": p.id, "name": p.name, "retail_price": p.retail_price})


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
def delete_product(product_id):
    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        db.delete(p)
        db.commit()
        return jsonify({"ok": True})


# ========== 别名管理 ==========

@app.route("/api/products/<int:product_id>/aliases", methods=["POST"])
def add_alias(product_id):
    alias = request.args.get("alias", "").strip()
    if not alias:
        return jsonify({"detail": "别名不能为空"}), 400

    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        existing = db.query(Alias).filter(
            Alias.product_id == product_id, Alias.alias == alias
        ).first()
        if existing:
            return jsonify({"detail": "该别名已存在"}), 400
        a = Alias(product_id=product_id, alias=alias)
        db.add(a)
        db.commit()
        db.refresh(a)
        return jsonify({"id": a.id, "alias": a.alias})


@app.route("/api/products/<int:product_id>/aliases/<int:alias_id>", methods=["DELETE"])
def delete_alias(product_id, alias_id):
    with SessionLocal() as db:
        a = db.query(Alias).filter(
            Alias.id == alias_id, Alias.product_id == product_id
        ).first()
        if not a:
            return jsonify({"detail": "别名不存在"}), 404
        db.delete(a)
        db.commit()
        return jsonify({"ok": True})


# ========== 批发价管理 ==========

@app.route("/api/products/<int:product_id>/wholesale", methods=["POST"])
def add_wholesale_price(product_id):
    price = request.args.get("price", type=float)
    supplier = request.args.get("supplier", "默认供应商")

    if price is None:
        return jsonify({"detail": "价格不能为空"}), 400

    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        wp = WholesalePrice(product_id=product_id, supplier=supplier, price=price)
        db.add(wp)
        db.commit()
        db.refresh(wp)
        return jsonify({"id": wp.id, "supplier": wp.supplier, "price": wp.price})


@app.route("/api/products/<int:product_id>/wholesale/<int:wpid>", methods=["PUT"])
def update_wholesale_price(product_id, wpid):
    price = request.args.get("price", type=float)
    supplier = request.args.get("supplier")

    with SessionLocal() as db:
        wp = db.query(WholesalePrice).filter(
            WholesalePrice.id == wpid, WholesalePrice.product_id == product_id
        ).first()
        if not wp:
            return jsonify({"detail": "批发价记录不存在"}), 404

        if price is not None:
            record_history(db, product_id, "wholesale_price", wp.price, price)
            wp.price = price
        if supplier is not None:
            wp.supplier = supplier

        db.commit()
        db.refresh(wp)
        return jsonify({"id": wp.id, "supplier": wp.supplier, "price": wp.price})


@app.route("/api/products/<int:product_id>/wholesale/<int:wpid>", methods=["DELETE"])
def delete_wholesale_price(product_id, wpid):
    with SessionLocal() as db:
        wp = db.query(WholesalePrice).filter(
            WholesalePrice.id == wpid, WholesalePrice.product_id == product_id
        ).first()
        if not wp:
            return jsonify({"detail": "批发价记录不存在"}), 404
        db.delete(wp)
        db.commit()
        return jsonify({"ok": True})


# ========== 搜索 ==========

@app.route("/api/search", methods=["GET"])
def search_products():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"items": []})

    keyword = f"%{q}%"

    with SessionLocal() as db:
        matched_aliases = db.query(Alias).filter(Alias.alias.like(keyword)).all()
        alias_product_ids = {a.product_id for a in matched_aliases}
        name_matches = db.query(Product).filter(Product.name.like(keyword)).all()
        all_product_ids = alias_product_ids | {p.id for p in name_matches}

        products = db.query(Product).filter(
            Product.id.in_(all_product_ids)
        ).all() if all_product_ids else []

        result = []
        for p in products:
            min_wholesale = None
            if p.wholesale_prices:
                min_wholesale = min(wp.price for wp in p.wholesale_prices)
            result.append({
                "id": p.id,
                "name": p.name,
                "retail_price": p.retail_price,
                "min_wholesale_price": min_wholesale,
                "profit": round(p.retail_price - min_wholesale, 2)
                    if (p.retail_price is not None and min_wholesale is not None) else None,
                "aliases": [a.alias for a in p.aliases],
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            })
        return jsonify({"items": result})


# ========== 统计 ==========

@app.route("/api/stats", methods=["GET"])
def get_stats():
    with SessionLocal() as db:
        total_products = db.query(Product).count()
        products = db.query(Product).all()

        profit_list = []
        for p in products:
            if p.retail_price is not None and p.wholesale_prices:
                min_wp = min(wp.price for wp in p.wholesale_prices)
                profit = round(p.retail_price - min_wp, 2)
                profit_pct = round(profit / min_wp * 100, 1)
                profit_list.append({
                    "id": p.id,
                    "name": p.name,
                    "retail_price": p.retail_price,
                    "min_wholesale_price": min_wp,
                    "profit": profit,
                    "profit_pct": profit_pct,
                })

        profit_list.sort(key=lambda x: x["profit"], reverse=True)
        total_wholesale_records = db.query(WholesalePrice).count()
        total_aliases = db.query(Alias).count()
        avg_profit_pct = (
            round(sum(x["profit_pct"] for x in profit_list) / len(profit_list), 1)
            if profit_list else 0
        )

        return jsonify({
            "total_products": total_products,
            "total_wholesale_records": total_wholesale_records,
            "total_aliases": total_aliases,
            "avg_profit_pct": avg_profit_pct,
            "profit_ranking": profit_list[:20],
        })


# ========== 价格历史 ==========

@app.route("/api/products/<int:product_id>/history", methods=["GET"])
def get_price_history(product_id):
    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404

        records = (
            db.query(PriceHistory)
            .filter(PriceHistory.product_id == product_id)
            .order_by(PriceHistory.changed_at.desc())
            .all()
        )
        return jsonify({
            "product_id": product_id,
            "product_name": p.name,
            "history": [
                {
                    "id": r.id,
                    "field": r.field,
                    "old_value": r.old_value,
                    "new_value": r.new_value,
                    "changed_at": r.changed_at.isoformat() if r.changed_at else None,
                }
                for r in records
            ],
        })


# ========== 首页 ==========

@app.route("/")
def root():
    # 检查静态文件是否存在
    static_index = os.path.join(app.static_folder, "index.html")
    if os.path.exists(static_index):
        return redirect("/static/index.html")
    # 备用：直接返回简单页面
    return "<h1>Shop Manager</h1><p><a href='/static/index.html'>打开管理页面</a></p>"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
