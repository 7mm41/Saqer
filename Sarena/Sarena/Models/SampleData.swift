import Foundation

// Demo catalogue used by the mock services and SwiftUI previews.
// Coordinates are approximate — confirm exact venue pins before release.

private func t(_ en: String, _ ar: String) -> LocalizedText { LocalizedText(en, ar: ar) }

/// Festival dates relative to today, at a local hour.
enum SampleDates {
    static func oman(daysFromNow days: Int, hour: Int) -> Date {
        let calendar = Calendar.current
        let day = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: .now)) ?? .now
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
    }
}

extension Venue {
    static let samples: [Venue] = {
        let now = Date.now
        let hour: TimeInterval = 3600

        return [
            Venue(
                id: "muscat-cinemas",
                category: .cinema,
                name: t("Muscat Premium Cinemas", "سينما مسقط بريميوم"),
                area: t("Al Khuwair, Muscat", "الخوير، مسقط"),
                summary: t("Blockbusters, recliners and Dolby Atmos at member prices.", "أحدث الأفلام بمقاعد مريحة وصوت Dolby Atmos بأسعار الأعضاء."),
                about: t(
                    "Muscat's most comfortable movie night. Twelve laser-projection halls with Dolby Atmos sound, fully reclining leather seats and a dedicated VIP lounge with in-seat service. Sarena members unlock exclusive prices on every show, every day of the week — including weekend premieres. Book here, receive your code instantly and scan it at the box office; no printing, no queues.",
                    "أمتع ليلة سينما في مسقط. اثنتا عشرة قاعة بعرض ليزر وصوت Dolby Atmos، ومقاعد جلدية قابلة للاستلقاء بالكامل، وصالة كبار الشخصيات مع خدمة حتى المقعد. يحصل أعضاء سرينا على أسعار حصرية لكل العروض طوال أيام الأسبوع بما فيها العروض الأولى في نهاية الأسبوع. احجز من هنا، واستلم الكود فوراً، وامسحه عند شباك التذاكر؛ بلا طباعة ولا طوابير."
                ),
                highlights: [t("Dolby Atmos halls", "قاعات Dolby Atmos"), t("Recliner seats", "مقاعد قابلة للاستلقاء"), t("Valid on weekends", "صالح في نهاية الأسبوع"), t("Instant digital code", "كود رقمي فوري")],
                openingHours: t("Daily · 10:00 AM – 1:00 AM", "يومياً · ١٠:٠٠ ص – ١:٠٠ ص"),
                latitude: 23.5872, longitude: 58.4067,
                rating: 4.8, reviewCount: 2140,
                tickets: [
                    TicketOption(id: "cin-reg", title: t("Standard show", "عرض عادي"), originalPrice: .baisa(4_500), memberPrice: .baisa(2_900),
                                 perks: [t("Any 2D show", "أي عرض ثنائي الأبعاد")], remaining: nil),
                    TicketOption(id: "cin-gold", title: t("VIP hall", "قاعة كبار الشخصيات"), originalPrice: .baisa(9_000), memberPrice: .baisa(5_500),
                                 perks: [t("Recliner in VIP hall", "مقعد في قاعة كبار الشخصيات"), t("Popcorn & drink combo", "وجبة فشار ومشروب")], remaining: 12),
                    TicketOption(id: "cin-fam", title: t("Group of 4", "مجموعة ٤ أشخاص"), originalPrice: .baisa(16_000), memberPrice: .baisa(9_900),
                                 perks: [t("4 tickets, same show", "٤ تذاكر لنفس العرض"), t("2 kids' snack boxes", "وجبتان خفيفتان للأطفال")], remaining: nil),
                ],
                isFeatured: true,
                dealEndsAt: now.addingTimeInterval(hour * 30)
            ),
            Venue(
                id: "almouj-jetski",
                category: .jetSki,
                name: t("Al Mouj Marina Jet Ski", "جيتسكي مرسى الموج"),
                area: t("Al Mouj, Muscat", "الموج، مسقط"),
                summary: t("Ride the Sea of Oman with certified instructors.", "انطلق في بحر عُمان مع مدربين معتمدين."),
                about: t(
                    "Launch from Al Mouj Marina on the latest Sea-Doo and Yamaha jet skis. Every ride starts with a safety briefing and life jackets for all riders; first-timers can ride with an instructor. VIP rides follow a guide along the coastline towards the Daymaniyat horizon at golden hour. Members get priority slots and the lowest price in Muscat.",
                    "انطلق من مرسى الموج على أحدث دراجات Sea-Doo وYamaha المائية. تبدأ كل رحلة بإرشادات السلامة وسترات نجاة لجميع الراكبين، ويمكن للمبتدئين الركوب مع مدرب. رحلات كبار الشخصيات ترافق مرشداً على طول الساحل باتجاه أفق جزر الديمانيات وقت الغروب. يحصل الأعضاء على أولوية الحجز وأقل سعر في مسقط."
                ),
                highlights: [t("Certified instructors", "مدربون معتمدون"), t("Life jackets included", "سترات النجاة مشمولة"), t("Sunset slots", "مواعيد وقت الغروب"), t("No licence needed", "لا تحتاج رخصة")],
                openingHours: t("Daily · 8:00 AM – 6:30 PM", "يومياً · ٨:٠٠ ص – ٦:٣٠ م"),
                latitude: 23.6286, longitude: 58.2785,
                rating: 4.9, reviewCount: 860,
                tickets: [
                    TicketOption(id: "js-reg", title: t("Solo ride", "جولة فردية"), originalPrice: .baisa(25_000), memberPrice: .baisa(15_000),
                                 perks: [t("30-minute ride", "رحلة ٣٠ دقيقة"), t("Safety briefing", "شرح السلامة")], remaining: nil),
                    TicketOption(id: "js-gold", title: t("Guided coast ride", "جولة ساحلية بمرشد"), originalPrice: .baisa(45_000), memberPrice: .baisa(27_000),
                                 perks: [t("60-minute guided coast ride", "رحلة ساحلية ٦٠ دقيقة مع مرشد"), t("GoPro footage", "تصوير بكاميرا GoPro")], remaining: 6),
                    TicketOption(id: "js-fam", title: t("Two jet skis", "دراجتان مائيتان"), originalPrice: .baisa(48_000), memberPrice: .baisa(29_500),
                                 perks: [t("2 jet skis · 30 minutes", "دراجتان مائيتان · ٣٠ دقيقة"), t("Kids ride with an instructor", "الأطفال يركبون مع مدرب")], remaining: nil),
                ],
                isFeatured: true,
                dealEndsAt: now.addingTimeInterval(hour * 52)
            ),
            Venue(
                id: "qantab-jetski",
                category: .jetSki,
                name: t("Qantab Bay Rides", "رحلات خليج قنتب"),
                area: t("Qantab, Muscat", "قنتب، مسقط"),
                summary: t("Crystal water, dramatic cliffs, zero crowds.", "مياه صافية ومنحدرات مذهلة بلا زحام."),
                about: t(
                    "A quieter alternative tucked between the cliffs of Qantab. Ride through turquoise coves, stop at hidden beaches and finish with Omani coffee on the shore. Group packages are perfect for friends and families visiting on the weekend.",
                    "وجهة أهدأ بين منحدرات قنتب. انطلق عبر الخلجان الفيروزية وتوقف عند الشواطئ المخفية واختم رحلتك بالقهوة العُمانية على الشاطئ. باقات المجموعات مثالية للأصدقاء والعائلات في عطلة نهاية الأسبوع."
                ),
                highlights: [t("Hidden coves", "خلجان مخفية"), t("Omani coffee on arrival", "قهوة عُمانية عند الوصول"), t("Group friendly", "مناسب للمجموعات")],
                openingHours: t("Thu – Sat · 7:30 AM – 5:30 PM", "الخميس – السبت · ٧:٣٠ ص – ٥:٣٠ م"),
                latitude: 23.5534, longitude: 58.6352,
                rating: 4.7, reviewCount: 312,
                tickets: [
                    TicketOption(id: "qb-reg", title: t("Quick ride", "جولة سريعة"), originalPrice: .baisa(18_000), memberPrice: .baisa(11_500),
                                 perks: [t("20-minute ride", "رحلة ٢٠ دقيقة")], remaining: nil),
                    TicketOption(id: "qb-gold", title: t("Private cove tour", "جولة الخلجان الخاصة"), originalPrice: .baisa(35_000), memberPrice: .baisa(22_000),
                                 perks: [t("40-minute private cove tour", "جولة خاصة ٤٠ دقيقة في الخلجان"), t("Omani coffee on the beach", "قهوة عُمانية على الشاطئ")], remaining: 8),
                    TicketOption(id: "qb-fam", title: t("Three jet skis", "ثلاث دراجات مائية"), originalPrice: .baisa(50_000), memberPrice: .baisa(30_000),
                                 perks: [t("3 jet skis · 40 minutes", "٣ دراجات مائية · ٤٠ دقيقة"), t("Beach stop included", "توقف على الشاطئ")], remaining: 9),
                ],
                isFeatured: false,
                dealEndsAt: nil
            ),
            Venue(
                id: "oman-shooting-club",
                category: .shootingClub,
                name: t("Oman Shooting Club", "نادي عمان للرماية"),
                area: t("Muscat", "مسقط"),
                summary: t("Supervised ranges for beginners and pros.", "ميادين رماية بإشراف كامل للمبتدئين والمحترفين."),
                about: t(
                    "Oman's home of precision shooting. Indoor pistol lanes, outdoor rifle ranges and a clay-pigeon field, all run by licensed range officers. Every session includes eye and ear protection and a one-to-one safety induction. Members save on single sessions and on the VIP multi-discipline package.",
                    "بيت الرماية الدقيقة في عُمان. ممرات رماية داخلية بالمسدس وميادين خارجية للبنادق وساحة لرماية الأطباق، يديرها جميعاً مشرفون مرخّصون. تشمل كل جلسة واقيات للعين والأذن وتعريفاً فردياً بإجراءات السلامة. يوفّر الأعضاء على الجلسات الفردية وعلى باقة كبار الشخصيات متعددة الفئات."
                ),
                highlights: [t("Licensed range officers", "مشرفون مرخّصون"), t("Protection gear included", "معدات الحماية مشمولة"), t("Clay-pigeon field", "ساحة رماية الأطباق")],
                openingHours: t("Sat – Thu · 4:00 PM – 10:00 PM", "السبت – الخميس · ٤:٠٠ م – ١٠:٠٠ م"),
                latitude: 23.5603, longitude: 58.3702,
                rating: 4.8, reviewCount: 540,
                tickets: [
                    TicketOption(id: "osc-reg", title: t("Pistol lane", "ممر المسدس"), originalPrice: .baisa(12_000), memberPrice: .baisa(7_500),
                                 perks: [t("25 rounds · pistol lane", "٢٥ طلقة · ممر المسدس")], remaining: nil),
                    TicketOption(id: "osc-gold", title: t("Full range experience", "تجربة الميدان الكاملة"), originalPrice: .baisa(30_000), memberPrice: .baisa(19_000),
                                 perks: [t("Pistol, rifle & clay", "مسدس وبندقية وأطباق"), t("Private range officer", "مشرف خاص")], remaining: 8),
                    TicketOption(id: "osc-fam", title: t("Group of 4", "مجموعة ٤ رماة"), originalPrice: .baisa(40_000), memberPrice: .baisa(26_000),
                                 perks: [t("Up to 4 shooters", "حتى ٤ رماة"), t("100 rounds shared", "١٠٠ طلقة مشتركة")], remaining: nil),
                ],
                isFeatured: false,
                dealEndsAt: nil
            ),
            Venue(
                id: "oman-automobile-association",
                category: .automobileClub,
                name: t("Oman Automobile Association", "نادي عمان للسيارات"),
                area: t("Muscat Speedway, Al Amerat", "حلبة مسقط، العامرات"),
                summary: t("Karting, drift experiences and real track days.", "كارتينج وتجارب دريفت وأيام حلبة حقيقية."),
                about: t(
                    "Feel real motorsport at the Oman Automobile Association. Race rental karts on the international circuit, ride shotgun with a professional drift driver, or bring your own car to an open track day with timing. Family passes include the junior karting track, so the whole family can race.",
                    "عِش رياضة السيارات الحقيقية في نادي عمان للسيارات. تسابق بسيارات الكارتينج على الحلبة الدولية، أو اركب بجانب سائق دريفت محترف، أو أحضر سيارتك ليوم حلبة مفتوح مع توقيت اللفات. تشمل الباقة العائلية حلبة كارتينج الناشئين لتتسابق العائلة كلها."
                ),
                highlights: [t("International circuit", "حلبة دولية"), t("Pro drift hot laps", "لفات دريفت مع محترفين"), t("Junior karting", "كارتينج للناشئين"), t("Lap timing", "توقيت اللفات")],
                openingHours: t("Wed – Sat · 3:00 PM – 11:00 PM", "الأربعاء – السبت · ٣:٠٠ م – ١١:٠٠ م"),
                latitude: 23.4725, longitude: 58.5395,
                rating: 4.9, reviewCount: 1275,
                tickets: [
                    TicketOption(id: "oaa-reg", title: t("Karting session", "جلسة كارتينج"), originalPrice: .baisa(10_000), memberPrice: .baisa(6_500),
                                 perks: [t("10-lap karting session", "جلسة كارتينج ١٠ لفات")], remaining: nil),
                    TicketOption(id: "oaa-gold", title: t("Drift hot laps", "لفات الدريفت"), originalPrice: .baisa(60_000), memberPrice: .baisa(39_000),
                                 perks: [t("3 drift hot laps", "٣ لفات دريفت"), t("Onboard video", "فيديو من داخل السيارة")], remaining: 4),
                    TicketOption(id: "oaa-fam", title: t("Group karting", "كارتينج جماعي"), originalPrice: .baisa(30_000), memberPrice: .baisa(19_500),
                                 perks: [t("2 adults + 2 juniors", "بالغان + ناشئان"), t("Junior track access", "دخول حلبة الناشئين")], remaining: nil),
                ],
                isFeatured: true,
                dealEndsAt: now.addingTimeInterval(hour * 75)
            ),
            Venue(
                id: "ibri-arena",
                category: .ibriArena,
                name: t("Ibri Arena", "ساحة عبري للاستعراض"),
                area: t("Ibri, Ad Dhahirah", "عبري، محافظة الظاهرة"),
                summary: t("Stunt shows, drifting and heritage parades.", "عروض استعراضية ودريفت ومسيرات تراثية."),
                about: t(
                    "The Ad Dhahirah region's favourite night out. Ibri Arena hosts live drift and stunt-driving shows, traditional horse and camel parades and weekend concerts under the stars. VIP stands sit right on the barrier with shaded seating and refreshments; family tickets include seats for four.",
                    "الوجهة المفضلة للسهر في محافظة الظاهرة. تستضيف ساحة عبري عروض الدريفت والقيادة الاستعراضية الحية، ومسيرات الخيل والهجن التقليدية، والحفلات في عطلات نهاية الأسبوع تحت النجوم. مدرجات كبار الشخصيات بجانب الحاجز مباشرة مع مقاعد مظللة ومرطبات، وتذاكر العائلة تشمل أربعة مقاعد."
                ),
                highlights: [t("Live drift shows", "عروض دريفت حية"), t("Heritage parades", "مسيرات تراثية"), t("Shaded VIP stands", "مدرجات مظللة لكبار الشخصيات")],
                openingHours: t("Thu – Sat · 5:00 PM – 12:00 AM", "الخميس – السبت · ٥:٠٠ م – ١٢:٠٠ ص"),
                latitude: 23.2257, longitude: 56.5157,
                rating: 4.6, reviewCount: 698,
                tickets: [
                    TicketOption(id: "iba-reg", title: t("General stand", "المدرج العام"), originalPrice: .baisa(5_000), memberPrice: .baisa(3_000),
                                 perks: [t("General stand", "المدرج العام")], remaining: nil),
                    TicketOption(id: "iba-gold", title: t("Barrier-side seat", "مقعد بجانب الحاجز"), originalPrice: .baisa(15_000), memberPrice: .baisa(9_500),
                                 perks: [t("Barrier-side seat", "مقعد بجانب الحاجز"), t("Refreshments", "مرطبات")], remaining: 14),
                    TicketOption(id: "iba-fam", title: t("4 seats together", "٤ مقاعد متجاورة"), originalPrice: .baisa(16_000), memberPrice: .baisa(10_000),
                                 perks: [t("4 seats together", "٤ مقاعد متجاورة")], remaining: nil),
                ],
                isFeatured: false,
                dealEndsAt: nil
            ),
            Venue(
                id: "muscat-arcade-hub",
                category: .videoGames,
                name: t("Muscat Arcade Hub", "مركز ألعاب مسقط"),
                area: t("Seeb, Muscat", "السيب، مسقط"),
                summary: t("VR, racing sims and 150+ arcade machines.", "واقع افتراضي ومحاكيات سباق وأكثر من ١٥٠ لعبة."),
                about: t(
                    "Muscat's biggest video game hall: more than 150 arcade machines, full-motion racing simulators, free-roam VR arenas and an esports lounge with the latest consoles. Load your credits once and play anything. The VIP pass unlocks unlimited play for three hours including VR, and group parties come with a private host.",
                    "أكبر صالة ألعاب فيديو في مسقط: أكثر من ١٥٠ جهاز ألعاب، ومحاكيات سباق متحركة بالكامل، وساحات واقع افتراضي حرة الحركة، وصالة رياضات إلكترونية بأحدث الأجهزة. اشحن رصيدك مرة واحدة والعب ما تشاء. تفتح تذكرة كبار الشخصيات لعباً غير محدود لثلاث ساعات بما فيها الواقع الافتراضي، وحفلات المجموعات تأتي مع مضيف خاص."
                ),
                highlights: [t("Free-roam VR", "واقع افتراضي حر الحركة"), t("Racing simulators", "محاكيات سباق"), t("Esports lounge", "صالة رياضات إلكترونية")],
                openingHours: t("Daily · 12:00 PM – 12:00 AM", "يومياً · ١٢:٠٠ م – ١٢:٠٠ ص"),
                latitude: 23.6003, longitude: 58.2452,
                rating: 4.7, reviewCount: 1893,
                tickets: [
                    TicketOption(id: "arc-reg", title: t("100 game credits", "١٠٠ رصيد ألعاب"), originalPrice: .baisa(10_000), memberPrice: .baisa(6_000),
                                 perks: [t("100 game credits", "١٠٠ رصيد ألعاب")], remaining: nil),
                    TicketOption(id: "arc-gold", title: t("Unlimited + VR", "غير محدود مع الواقع الافتراضي"), originalPrice: .baisa(20_000), memberPrice: .baisa(12_000),
                                 perks: [t("3 hours unlimited", "٣ ساعات غير محدودة"), t("VR included", "الواقع الافتراضي مشمول")], remaining: 20),
                    TicketOption(id: "arc-fam", title: t("Group of 4", "مجموعة ٤ لاعبين"), originalPrice: .baisa(32_000), memberPrice: .baisa(19_000),
                                 perks: [t("4 players · 2 hours unlimited", "٤ لاعبين · ساعتان غير محدودة"), t("Kids' VR zone", "منطقة واقع افتراضي للأطفال")], remaining: 5),
                ],
                isFeatured: false,
                dealEndsAt: nil
            ),
            Venue(
                id: "muscat-nights",
                category: .festivals,
                name: t("Muscat Nights", "ليالي مسقط"),
                area: t("Al Amerat Park, Muscat", "حديقة العامرات، مسقط"),
                summary: t("Fireworks, concerts and food under winter skies.", "ألعاب نارية وحفلات ومأكولات تحت سماء الشتاء."),
                about: t(
                    "Muscat Nights turns the capital's parks into a winter wonderland: nightly fireworks, drone light shows, live Omani and international concerts, a heritage village and hundreds of food stalls. Members skip the gate queue with a dedicated fast lane, and VIP passes add reserved seating for the main stage.",
                    "تحوّل ليالي مسقط حدائق العاصمة إلى عالم شتوي ساحر: ألعاب نارية كل ليلة، وعروض ضوئية بالطائرات المسيّرة، وحفلات عُمانية وعالمية حية، وقرية تراثية، ومئات من أكشاك الطعام. يتجاوز الأعضاء طوابير البوابة عبر مسار سريع مخصص، وتضيف تذاكر كبار الشخصيات مقاعد محجوزة أمام المسرح الرئيسي."
                ),
                highlights: [t("Nightly fireworks", "ألعاب نارية كل ليلة"), t("Drone light shows", "عروض ضوئية بالطائرات المسيّرة"), t("Members' fast lane", "مسار سريع للأعضاء"), t("Heritage village", "قرية تراثية")],
                openingHours: t("Daily · 4:00 PM – 12:00 AM", "يومياً · ٤:٠٠ م – ١٢:٠٠ ص"),
                latitude: 23.5268, longitude: 58.4937,
                rating: 4.9, reviewCount: 5230,
                tickets: [
                    TicketOption(id: "mn-reg", title: t("Entry + fast lane", "دخول ومسار سريع"), originalPrice: .baisa(3_000), memberPrice: .baisa(1_500),
                                 perks: [t("Entry + fast lane", "دخول + مسار سريع")], remaining: nil),
                    TicketOption(id: "mn-gold", title: t("Main-stage seat", "مقعد المسرح الرئيسي"), originalPrice: .baisa(12_000), memberPrice: .baisa(7_500),
                                 perks: [t("Reserved main-stage seat", "مقعد محجوز أمام المسرح"), t("Lounge access", "دخول الصالة")], remaining: 10),
                    TicketOption(id: "mn-fam", title: t("Entry for 4", "دخول ٤ أشخاص"), originalPrice: .baisa(9_000), memberPrice: .baisa(5_500),
                                 perks: [t("Entry for 4", "دخول ٤ أشخاص"), t("Kids' zone wristbands", "أساور منطقة الأطفال")], remaining: nil),
                ],
                isFeatured: true,
                dealEndsAt: now.addingTimeInterval(hour * 9),
                eventStartsAt: SampleDates.oman(daysFromNow: 12, hour: 17),
                eventEndsAt: SampleDates.oman(daysFromNow: 33, hour: 23)
            ),
            Venue(
                id: "ibri-festival",
                category: .festivals,
                name: t("Ibri Festival", "مهرجان عبري"),
                area: t("Ibri, Ad Dhahirah", "عبري، محافظة الظاهرة"),
                summary: t("Heritage, crafts and family evenings in Ibri.", "تراث وحِرف وأمسيات عائلية في عبري."),
                about: t(
                    "Ibri Festival celebrates the heritage of Ad Dhahirah with traditional crafts, folk arts, camel racing showcases, local cuisine and children's activities every evening. It is one of the region's biggest family events of the year, and Sarena members enjoy half-price entry.",
                    "يحتفي مهرجان عبري بتراث محافظة الظاهرة عبر الحِرف التقليدية والفنون الشعبية وعروض سباقات الهجن والمأكولات المحلية وأنشطة الأطفال كل مساء. يُعد من أكبر الفعاليات العائلية في المنطقة خلال العام، ويستمتع أعضاء سرينا بالدخول بنصف السعر."
                ),
                highlights: [t("Folk arts", "فنون شعبية"), t("Traditional crafts", "حِرف تقليدية"), t("Kids' activities", "أنشطة للأطفال")],
                openingHours: t("Daily · 4:00 PM – 11:00 PM", "يومياً · ٤:٠٠ م – ١١:٠٠ م"),
                latitude: 23.2402, longitude: 56.4948,
                rating: 4.7, reviewCount: 980,
                tickets: [
                    TicketOption(id: "if-reg", title: t("Festival entry", "دخول المهرجان"), originalPrice: .baisa(2_000), memberPrice: .baisa(1_000),
                                 perks: [t("Festival entry", "دخول المهرجان")], remaining: nil),
                    TicketOption(id: "if-gold", title: t("Majlis seating", "جلسة المجلس"), originalPrice: .baisa(10_000), memberPrice: .baisa(6_500),
                                 perks: [t("Majlis seating", "جلسة في المجلس"), t("Omani coffee & dates", "قهوة عُمانية وتمر")], remaining: 15),
                    TicketOption(id: "if-fam", title: t("Entry for 4", "دخول ٤ أشخاص"), originalPrice: .baisa(6_000), memberPrice: .baisa(3_500),
                                 perks: [t("Entry for 4", "دخول ٤ أشخاص")], remaining: nil),
                ],
                isFeatured: false,
                dealEndsAt: nil,
                eventStartsAt: SampleDates.oman(daysFromNow: 30, hour: 16),
                eventEndsAt: SampleDates.oman(daysFromNow: 37, hour: 23)
            ),
        ]
    }()
}

extension PromoCode {
    /// Seeds a new member's wallet so both tabs have something to show in the demo.
    static func welcomeSamples(now: Date = .now) -> [PromoCode] {
        let venues = Venue.samples
        let day: TimeInterval = 86_400

        func make(_ venueID: String, ticket index: Int, code: String, quantity: Int, purchasedDaysAgo: Double,
                  validDays: Double, usedDaysAgo: Double? = nil) -> PromoCode? {
            guard let venue = venues.first(where: { $0.id == venueID }), venue.tickets.indices.contains(index) else { return nil }
            let ticket = venue.tickets[index]
            let purchased = now.addingTimeInterval(-purchasedDaysAgo * day)
            return PromoCode(
                id: UUID().uuidString, code: code, venueID: venue.id, venueName: venue.name, category: venue.category,
                offerTitle: ticket.title, quantity: quantity,
                paidTotal: ticket.memberPrice * Decimal(quantity), originalTotal: ticket.originalPrice * Decimal(quantity),
                purchasedAt: purchased, expiresAt: purchased.addingTimeInterval(validDays * day),
                status: usedDaysAgo == nil ? .active : .used,
                usedAt: usedDaysAgo.map { now.addingTimeInterval(-$0 * day) },
                eventStartsAt: venue.eventStartsAt
            )
        }

        return [
            make("muscat-cinemas", ticket: 1, code: "SRN-VIP7-KQ4M", quantity: 2, purchasedDaysAgo: 1, validDays: 30),
            make("almouj-jetski", ticket: 0, code: "SRN-J3T5-K2WX", quantity: 1, purchasedDaysAgo: 20, validDays: 30, usedDaysAgo: 12),
            make("muscat-arcade-hub", ticket: 1, code: "SRN-G4ME-8PLY", quantity: 2, purchasedDaysAgo: 34, validDays: 30, usedDaysAgo: 30),
            make("ibri-festival", ticket: 2, code: "SRN-1BR1-F3ST", quantity: 1, purchasedDaysAgo: 70, validDays: 30),
        ].compactMap { $0 }
    }
}
