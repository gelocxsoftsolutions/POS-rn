package com.nctseafoods.pos;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Code 128B raster output for narrow ESC/POS printers; no firmware barcode-width limit. */
public final class Code128Raster {
  private static final String[] PATTERNS = {"212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"};
  private static final int QUIET_MODULES = 10;
  private static final int HEIGHT = 80;
  private Code128Raster() {}

  public static byte[] encode(String value, boolean showText, int printableDots) {
    if (value == null || value.isEmpty()) throw new IllegalArgumentException("The barcode is empty.");
    int[] symbols = new int[value.length() + 3];
    symbols[0] = 104;
    int checksum = 104;
    for (int i = 0; i < value.length(); i++) {
      int code = value.charAt(i) - 32;
      if (code < 0 || code > 94) throw new IllegalArgumentException("The barcode contains unsupported characters.");
      symbols[i + 1] = code;
      checksum = (checksum + code * ((i + 1) % 103)) % 103;
    }
    symbols[symbols.length - 2] = checksum;
    symbols[symbols.length - 1] = 106;
    int moduleCount = QUIET_MODULES * 2;
    for (int symbol : symbols) for (char width : PATTERNS[symbol].toCharArray()) moduleCount += width - '0';
    int scale = Math.min(2, printableDots / moduleCount);
    if (scale < 1) throw new IllegalArgumentException("This barcode is too long for the selected printer width.");
    int widthBytes = (moduleCount * scale + 7) / 8;
    byte[] row = new byte[widthBytes];
    int x = QUIET_MODULES * scale;
    for (int symbol : symbols) {
      String pattern = PATTERNS[symbol];
      for (int index = 0; index < pattern.length(); index++) {
        int width = (pattern.charAt(index) - '0') * scale;
        if (index % 2 == 0) for (int pixel = x; pixel < x + width; pixel++) row[pixel / 8] |= (byte)(0x80 >> (pixel % 8));
        x += width;
      }
    }
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    put(output, 10, 27, 97, 1, 29, 118, 48, 0, widthBytes & 255, widthBytes >> 8, HEIGHT & 255, HEIGHT >> 8);
    for (int y = 0; y < HEIGHT; y++) output.write(row, 0, row.length);
    put(output, 10);
    if (showText) {
      byte[] text = value.getBytes(StandardCharsets.US_ASCII);
      output.write(text, 0, text.length);
      put(output, 10);
    }
    put(output, 27, 97, 0);
    return output.toByteArray();
  }

  private static void put(ByteArrayOutputStream output, int... bytes) {
    for (int value : bytes) output.write(value);
  }
}
