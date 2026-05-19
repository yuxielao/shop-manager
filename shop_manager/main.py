from flask import Flask, request, jsonify, redirect, send_from_directory
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional
import os

from database import engine, SessionLocal, Base
from models import Product, Alias, Variant, Category, PriceHistory

Base.metadata.create_all(bind=engine)

app = Flask(__name__, static_folder="static", static_url_path="/static")


def record_history(db: Session, product_id: int, field: str, old_val, new_val, variant_id=None):
    if old_val != new_val:
        db.add(PriceHistory(
            product_id=product_id,
            variant_id=variant_id,
            field=field,
            old_value=old_val,
            new_value=new_val,
        ))


def seed_default_categories(db: Session):
    if db.query(Category).count() == 0:
        defaults = [
            Category(name="饮料类", sort_order=1),
            Category(name="酒类", sort_order=2),
            Category(name="烟类", sort_order=3),
            Category(name="零食类", sort_order=4),
        ]
        db.add_all(defaults)
        db.commit()


def product_to_dict(p: Product, show_profit=False):
    variants_data = []
    min_unit_cost = None
    best_profit = None
    for v in p.variants:
        unit_cost = round(v.purchase_price / v.case_size, 2) if (v.purchase_price is not None and v.case_size) else None
        unit_profit = round(v.retail_price - unit_cost, 2) if (v.retail_price is not None and unit_cost is not None) else None
        variants_data.append({
            "id": v.id,
            "size": v.size,
            "case_size": v.case_size,
            "purchase_price": v.purchase_price,
            "wholesale_price": v.wholesale_price,
            "retail_price": v.retail_price,
            "unit_cost": unit_cost,
            "unit_profit": unit_profit,
        })
        if unit_cost is not None:
            if min_unit_cost is None or unit_cost < min_unit_cost:
                min_unit_cost = unit_cost
        if unit_profit is not None:
            if best_profit is None or unit_profit > best_profit:
                best_profit = unit_profit

    return {
        "id": p.id,
        "name": p.name,
        "category_id": p.category_id,
        "category_name": p.category.name if p.category else None,
        "min_unit_cost": min_unit_cost,
        "best_profit": best_profit,
        "variant_count": len(p.variants),
        "alias_count": len(p.aliases),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "aliases": [{"id": a.id, "alias": a.alias} for a in p.aliases],
        "variants": variants_data,
    }


# ========== 分类管理 ==========

@app.route("/api/categories", methods=["GET"])
def list_categories():
    with SessionLocal() as db:
        seed_default_categories(db)
        cats = db.query(Category).order_by(Category.sort_order, Category.id).all()
        return jsonify([
            {"id": c.id, "name": c.name, "sort_order": c.sort_order}
            for c in cats
        ])


@app.route("/api/categories", methods=["POST"])
def create_category():
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"detail": "分类名称不能为空"}), 400
    with SessionLocal() as db:
        if db.query(Category).filter(Category.name == name).first():
            return jsonify({"detail": "分类已存在"}), 400
        c = Category(name=name)
        db.add(c)
        db.commit()
        db.refresh(c)
        return jsonify({"id": c.id, "name": c.name, "sort_order": c.sort_order})


@app.route("/api/categories/<int:cat_id>", methods=["PUT"])
def update_category(cat_id):
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"detail": "分类名称不能为空"}), 400
    with SessionLocal() as db:
        c = db.query(Category).filter(Category.id == cat_id).first()
        if not c:
            return jsonify({"detail": "分类不存在"}), 404
        c.name = name
        db.commit()
        return jsonify({"id": c.id, "name": c.name, "sort_order": c.sort_order})


@app.route("/api/categories/<int:cat_id>", methods=["DELETE"])
def delete_category(cat_id):
    with SessionLocal() as db:
        c = db.query(Category).filter(Category.id == cat_id).first()
        if not c:
            return jsonify({"detail": "分类不存在"}), 404
        product_count = db.query(Product).filter(Product.category_id == cat_id).count()
        if product_count > 0:
            return jsonify({"detail": f"该分类下有 {product_count} 个商品，无法删除"}), 400
        db.delete(c)
        db.commit()
        return jsonify({"ok": True})


# ========== 商品管理 ==========

@app.route("/api/products", methods=["GET"])
def list_products():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    category_id = request.args.get("category_id", type=int)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    with SessionLocal() as db:
        seed_default_categories(db)
        q = db.query(Product)
        if category_id:
            q = q.filter(Product.category_id == category_id)
        total = q.count()
        products = (
            q.order_by(Product.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [product_to_dict(p) for p in products]
        return jsonify({"total": total, "page": page, "page_size": page_size, "items": items})


@app.route("/api/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        return jsonify(product_to_dict(p))


@app.route("/api/products", methods=["POST"])
def create_product():
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"detail": "商品名称不能为空"}), 400
    category_id = request.args.get("category_id", type=int)

    with SessionLocal() as db:
        product = Product(name=name, category_id=category_id)
        db.add(product)
        db.flush()

        # 可选初始变体
        size = request.args.get("size", "").strip() or None
        case_size = request.args.get("case_size", 1, type=int)
        purchase_price = request.args.get("purchase_price", type=float)
        wholesale_price = request.args.get("wholesale_price", type=float)
        retail_price = request.args.get("retail_price", type=float)

        if retail_price is not None or purchase_price is not None:
            v = Variant(
                product_id=product.id,
                size=size,
                case_size=case_size,
                purchase_price=purchase_price,
                wholesale_price=wholesale_price,
                retail_price=retail_price,
            )
            db.add(v)

        db.commit()
        db.refresh(product)
        return jsonify(product_to_dict(product))


@app.route("/api/products/<int:product_id>", methods=["PUT"])
def update_product(product_id):
    name = request.args.get("name")
    category_id = request.args.get("category_id", type=int)

    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404

        if name is not None:
            p.name = name
        if request.args.get("category_id") is not None:
            p.category_id = category_id

        p.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(p)
        return jsonify(product_to_dict(p))


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


# ========== 变体管理 ==========

@app.route("/api/products/<int:product_id>/variants", methods=["POST"])
def add_variant(product_id):
    size = request.args.get("size", "").strip() or None
    case_size = request.args.get("case_size", 1, type=int)
    purchase_price = request.args.get("purchase_price", type=float)
    wholesale_price = request.args.get("wholesale_price", type=float)
    retail_price = request.args.get("retail_price", type=float)

    with SessionLocal() as db:
        p = db.query(Product).filter(Product.id == product_id).first()
        if not p:
            return jsonify({"detail": "商品不存在"}), 404
        v = Variant(
            product_id=product_id,
            size=size,
            case_size=case_size,
            purchase_price=purchase_price,
            wholesale_price=wholesale_price,
            retail_price=retail_price,
        )
        db.add(v)
        p.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(v)
        return jsonify({
            "id": v.id, "size": v.size, "case_size": v.case_size,
            "purchase_price": v.purchase_price, "wholesale_price": v.wholesale_price,
            "retail_price": v.retail_price,
        })


@app.route("/api/products/<int:product_id>/variants/<int:vid>", methods=["PUT"])
def update_variant(product_id, vid):
    with SessionLocal() as db:
        v = db.query(Variant).filter(
            Variant.id == vid, Variant.product_id == product_id
        ).first()
        if not v:
            return jsonify({"detail": "变体不存在"}), 404

        for field in ["purchase_price", "wholesale_price", "retail_price"]:
            val = request.args.get(field, type=float)
            if val is not None:
                old = getattr(v, field)
                record_history(db, product_id, field, old, val, variant_id=vid)
                setattr(v, field, val)

        if request.args.get("size") is not None:
            v.size = request.args.get("size").strip() or None
        if request.args.get("case_size") is not None:
            v.case_size = request.args.get("case_size", type=int)

        p = db.query(Product).filter(Product.id == product_id).first()
        p.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(v)
        return jsonify({
            "id": v.id, "size": v.size, "case_size": v.case_size,
            "purchase_price": v.purchase_price, "wholesale_price": v.wholesale_price,
            "retail_price": v.retail_price,
        })


@app.route("/api/products/<int:product_id>/variants/<int:vid>", methods=["DELETE"])
def delete_variant(product_id, vid):
    with SessionLocal() as db:
        v = db.query(Variant).filter(
            Variant.id == vid, Variant.product_id == product_id
        ).first()
        if not v:
            return jsonify({"detail": "变体不存在"}), 404
        db.delete(v)
        p = db.query(Product).filter(Product.id == product_id).first()
        p.updated_at = datetime.now(timezone.utc)
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

        result = [product_to_dict(p) for p in products]
        return jsonify({"items": result})


# ========== 统计 ==========

@app.route("/api/stats", methods=["GET"])
def get_stats():
    with SessionLocal() as db:
        total_products = db.query(Product).count()
        total_variants = db.query(Variant).count()
        total_aliases = db.query(Alias).count()
        total_categories = db.query(Category).count()

        # 分类占比
        from sqlalchemy import func
        cat_stats = db.query(
            Category.name, func.count(Product.id)
        ).outerjoin(Product).group_by(Category.id, Category.name).all()

        # 利润排行
        profit_list = []
        variants = db.query(Variant).all()
        for v in variants:
            if v.purchase_price is not None and v.retail_price is not None and v.case_size:
                unit_cost = v.purchase_price / v.case_size
                unit_profit = round(v.retail_price - unit_cost, 2)
                profit_pct = round(unit_profit / unit_cost * 100, 1)
                profit_list.append({
                    "product_id": v.product_id,
                    "product_name": v.product.name,
                    "variant_id": v.id,
                    "size": v.size,
                    "retail_price": v.retail_price,
                    "unit_cost": round(unit_cost, 2),
                    "unit_profit": unit_profit,
                    "profit_pct": profit_pct,
                })

        profit_list.sort(key=lambda x: x["unit_profit"], reverse=True)
        avg_profit_pct = (
            round(sum(x["profit_pct"] for x in profit_list) / len(profit_list), 1)
            if profit_list else 0
        )

        return jsonify({
            "total_products": total_products,
            "total_variants": total_variants,
            "total_aliases": total_aliases,
            "total_categories": total_categories,
            "avg_profit_pct": avg_profit_pct,
            "category_distribution": [{"name": name, "count": cnt} for name, cnt in cat_stats],
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
                    "variant_id": r.variant_id,
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
    static_index = os.path.join(app.static_folder, "index.html")
    if os.path.exists(static_index):
        return redirect("/static/index.html")
    return "<h1>Shop Manager</h1><p><a href='/static/index.html'>打开管理页面</a></p>"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
