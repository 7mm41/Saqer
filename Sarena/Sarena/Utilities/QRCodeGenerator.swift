import CoreImage.CIFilterBuiltins
import UIKit

enum QRCodeGenerator {
    private static let context = CIContext()
    /// Views are re-created often; never render the same code twice.
    private static let cache = NSCache<NSString, UIImage>()

    /// Crisp QR image for the given payload. Render it with `.interpolation(.none)`.
    static func image(for payload: String, scale: CGFloat = 12) -> UIImage? {
        let key = "\(payload)#\(scale)" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
              let cgImage = context.createCGImage(output, from: output.extent) else {
            return nil
        }
        let image = UIImage(cgImage: cgImage)
        cache.setObject(image, forKey: key)
        return image
    }
}
