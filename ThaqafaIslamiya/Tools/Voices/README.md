# الأصوات الطبيعية

`gen_voices.py` يولّد مقاطع صوتية طبيعية واضحة بمحرك [Piper](https://github.com/OHF-Voice/piper1-gpl) العصبي (يعمل محليًا)،
ثم يطبّع مستوى الصوت ويضغطه AAC أحادي 28kbps. المقاطع تُدمج في التطبيق فلا تحتاج إنترنت.

| اللغة | الصوت |
|---|---|
| العربية | `ar_JO-kareem-medium` (مع تشكيل تلقائي للنصوص، وتشكيل يدوي كامل للأدعية) |
| English | `en_US-lessac-high` |
| فارسی | `fa_IR-gyro-medium` |
| Türkçe | `tr_TR-dfki-medium` |
| हिन्दी | `hi_IN-priyamvada-medium` |
| বাংলা | `bn_BD-google-medium` |

```bash
pip install piper-tts imageio-ffmpeg
python3 -m piper.download_voices ar_JO-kareem-medium en_US-lessac-high fa_IR-gyro-medium \
    tr_TR-dfki-medium hi_IN-priyamvada-medium bn_BD-google-medium --data-dir voices
python3 gen_voices.py ../../ThaqafaIslamiya/Assets/Voices              # كل اللغات
python3 gen_voices.py ../../ThaqafaIslamiya/Assets/Voices ar --only dua # الأدعية فقط
```

المقاطع الموجودة لا يُعاد توليدها؛ احذف المقطع لإعادة توليده بعد تعديل نصه.

## صوت الراوي العربي الواقعي (خدمة سحابية)

لصوت رجل واقعي (30–35 سنة، دافئ رخيم، فصحى واضحة، إيقاع تعليمي هادئ) استخدم `gen_voices_cloud.py` مع إحدى الخدمات.
يُقرأ المفتاح من متغيّر بيئة فقط، والمقاطع الناتجة تحمل الأسماء نفسها فتستبدل الأصوات العربية الحالية مباشرة.

| الخدمة | متغيّر المفتاح | الصوت الافتراضي |
|---|---|---|
| ElevenLabs (الأكثر واقعية) | `ELEVENLABS_API_KEY` | تختاره بنفسك: `--list-voices` يعرض أصوات الرجال العربية |
| Google Cloud TTS (Chirp 3 HD) | `GOOGLE_TTS_API_KEY` | `ar-XA-Chirp3-HD-Charon` |
| Azure Speech | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | `ar-OM-AbdullahNeural` |

```bash
python3 gen_voices_cloud.py --provider elevenlabs --list-voices
python3 gen_voices_cloud.py /tmp/sample --provider elevenlabs --voice <voice_id> --sample   # تجربة مقطعين
python3 gen_voices_cloud.py ../../ThaqafaIslamiya/Assets/Voices --provider elevenlabs --voice <voice_id> --force
```
