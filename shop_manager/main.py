from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from database import engine, get_db, Base
from models import Product, Alias, WholesalePrice, PriceHistory

Base.metadata.create_all(bind=engine)

app = FastAPI(title="商品价格管理系统")


def record_history(db: Session, product_id: int, field: str, old_val, new_val):
    if old_val != new_val:
        db.add(PriceHistory(
            product_id=product_id,
            field=field,
            old_value=old_val,
            new_value=new_val,
        ))


# ========== 商品管理 ==========

@app.get("/api/products")
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
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
            "profit": round(p.retail_price - min_wholesale, 2) if (p.retail_price is not None and min_wholesale is not None) else None,
            "alias_count": len(p.aliases),
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return {"total": total, "page": page, "page_size": page_size, "items": result}


@app.get("/api/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")
    return {
        "id": p.id,
        "name": p.name,
        "retail_price": p.retail_price,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "aliases": [{"id": a.id, "alias": a.alias} for a in p.aliases],
        "wholesale_prices": [
            {"id": wp.id, "supplier": wp.supplier, "price": wp.price, "created_at": wp.created_at.isoformat() if wp.created_at else None}
            for wp in p.wholesale_prices
        ],
    }


@app.post("/api/products")
def create_product(name: str, retail_price: Optional[float] = None, db: Session = Depends(get_db)):
    product = Product(name=name, retail_price=retail_price)
    db.add(product)
    db.commit()
    db.refresh(product)
    return {"id": product.id, "name": product.name, "retail_price": product.retail_price}


@app.put("/api/products/{product_id}")
def update_product(
    product_id: int,
    name: Optional[str] = None,
    retail_price: Optional[float] = None,
    db: Session = Depends(get_db),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")

    if retail_price is not None:
        record_history(db, product_id, "retail_price", p.retail_price, retail_price)
        p.retail_price = retail_price
    if name is not None:
        p.name = name

    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "retail_price": p.retail_price}


@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")
    db.delete(p)
    db.commit()
    return {"ok": True}


# ========== 别名管理 ==========

@app.post("/api/products/{product_id}/aliases")
def add_alias(product_id: int, alias: str, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")
    existing = db.query(Alias).filter(Alias.product_id == product_id, Alias.alias == alias).first()
    if existing:
        raise HTTPException(400, "该别名已存在")
    a = Alias(product_id=product_id, alias=alias)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "alias": a.alias}


@app.delete("/api/products/{product_id}/aliases/{alias_id}")
def delete_alias(product_id: int, alias_id: int, db: Session = Depends(get_db)):
    a = db.query(Alias).filter(Alias.id == alias_id, Alias.product_id == product_id).first()
    if not a:
        raise HTTPException(404, "别名不存在")
    db.delete(a)
    db.commit()
    return {"ok": True}


# ========== 批发价管理 ==========

@app.post("/api/products/{product_id}/wholesale")
def add_wholesale_price(
    product_id: int,
    price: float,
    supplier: str = "默认供应商",
    db: Session = Depends(get_db),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")
    wp = WholesalePrice(product_id=product_id, supplier=supplier, price=price)
    db.add(wp)
    db.commit()
    db.refresh(wp)
    return {"id": wp.id, "supplier": wp.supplier, "price": wp.price}


@app.put("/api/products/{product_id}/wholesale/{wpid}")
def update_wholesale_price(
    product_id: int,
    wpid: int,
    price: Optional[float] = None,
    supplier: Optional[str] = None,
    db: Session = Depends(get_db),
):
    wp = db.query(WholesalePrice).filter(
        WholesalePrice.id == wpid, WholesalePrice.product_id == product_id
    ).first()
    if not wp:
        raise HTTPException(404, "批发价记录不存在")

    if price is not None:
        record_history(db, product_id, "wholesale_price", wp.price, price)
        wp.price = price
    if supplier is not None:
        wp.supplier = supplier

    db.commit()
    db.refresh(wp)
    return {"id": wp.id, "supplier": wp.supplier, "price": wp.price}


@app.delete("/api/products/{product_id}/wholesale/{wpid}")
def delete_wholesale_price(product_id: int, wpid: int, db: Session = Depends(get_db)):
    wp = db.query(WholesalePrice).filter(
        WholesalePrice.id == wpid, WholesalePrice.product_id == product_id
    ).first()
    if not wp:
        raise HTTPException(404, "批发价记录不存在")
    db.delete(wp)
    db.commit()
    return {"ok": True}


# ========== 搜索 ==========

@app.get("/api/search")
def search_products(q: str = "", db: Session = Depends(get_db)):
    if not q.strip():
        return {"items": []}

    keyword = f"%{q.strip()}%"
    matched_aliases = db.query(Alias).filter(Alias.alias.like(keyword)).all()
    alias_product_ids = {a.product_id for a in matched_aliases}

    name_matches = db.query(Product).filter(Product.name.like(keyword)).all()

    all_product_ids = alias_product_ids | {p.id for p in name_matches}
    products = db.query(Product).filter(Product.id.in_(all_product_ids)).all() if all_product_ids else []

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
            "profit": round(p.retail_price - min_wholesale, 2) if (p.retail_price is not None and min_wholesale is not None) else None,
            "aliases": [a.alias for a in p.aliases],
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })
    return {"items": result}


# ========== 统计 ==========

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
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

    avg_profit_pct = round(sum(x["profit_pct"] for x in profit_list) / len(profit_list), 1) if profit_list else 0

    return {
        "total_products": total_products,
        "total_wholesale_records": total_wholesale_records,
        "total_aliases": total_aliases,
        "avg_profit_pct": avg_profit_pct,
        "profit_ranking": profit_list[:20],
    }


# ========== 价格历史 ==========

@app.get("/api/products/{product_id}/history")
def get_price_history(product_id: int, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "商品不存在")

    records = (
        db.query(PriceHistory)
        .filter(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.changed_at.desc())
        .all()
    )
    return {
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
    }


# ========== 静态文件 ==========

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")
