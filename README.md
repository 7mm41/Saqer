# أداة نافذة المتجر (Store Popup)

نافذة منبثقة خفيفة تعرض **صورة المتجر** و**رابطه** و**معلومات الاتصال**، بدون أي مكتبات خارجية.

- `index.html` — صفحة لتعديل البيانات ومعاينة النافذة وتوليد كود التضمين.
- `store-popup.js` — الأداة نفسها (ملف واحد).

## التضمين في موقعك

```html
<script>
  window.StorePopupConfig = {
    name: "متجري",
    tagline: "منتجات مختارة بعناية",
    image: "https://.../cover.jpg",
    logo: "https://.../logo.png",
    url: "https://mystore.com",
    phone: "+966 50 000 0000",
    whatsapp: "966500000000",
    email: "info@mystore.com",
    address: "الرياض",
    hours: "يومياً 9 ص – 11 م",
    social: { instagram: "mystore", x: "mystore", snapchat: "", tiktok: "" },
    accent: "#0f766e",
    position: "left",      // مكان الزر العائم: left أو right
    autoOpenDelay: 0       // فتح تلقائي بعد X ثانية (0 = معطّل)
  };
</script>
<script src="store-popup.js" defer></script>
```

التحكم برمجياً: `StorePopup.open()` و`StorePopup.close()` و`StorePopup.init({...})`.

## المزايا

- زر عائم يفتح النافذة، وتُغلق بزر الإغلاق أو بالنقر خارجها أو بمفتاح Esc.
- زر لزيارة المتجر، ونسخ الرابط، ومشاركته.
- روابط مباشرة للاتصال وواتساب والبريد والخريطة.
- يدعم العربية (RTL)، والوضع الداكن، والجوال.
- معزول داخل Shadow DOM فلا يتأثر بتنسيقات موقعك ولا يؤثر عليها.
