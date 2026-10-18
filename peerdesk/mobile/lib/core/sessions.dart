/// Permission vocabulary shared with the Python host (sessions.py).
library;

enum Permission {
  view('view'),
  control('control'),
  fileTransfer('file_transfer'),
  clipboard('clipboard'),
  audio('audio');

  final String wire;
  const Permission(this.wire);

  static Permission? fromWire(String value) {
    for (final p in Permission.values) {
      if (p.wire == value) return p;
    }
    return null;
  }

  static Set<Permission> fromWireList(Iterable list) {
    final out = <Permission>{};
    for (final v in list) {
      final p = fromWire(v.toString());
      if (p != null) out.add(p);
    }
    return out;
  }

  static List<String> toWireList(Iterable<Permission> perms) =>
      perms.map((p) => p.wire).toList()..sort();
}

String permissionLabel(Permission p) {
  switch (p) {
    case Permission.view:
      return 'View the screen';
    case Permission.control:
      return 'Control keyboard & mouse';
    case Permission.fileTransfer:
      return 'Transfer files';
    case Permission.clipboard:
      return 'Share clipboard';
    case Permission.audio:
      return 'Stream audio';
  }
}
