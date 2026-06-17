#!/usr/bin/env python3
"""
Simple HTTP server for local development
Run this to serve the Oslo Trail Running Map locally and avoid CORS issues
"""

import http.server
import socketserver
import sys

PORT = 8000

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that suppresses BrokenPipeError messages"""

    def log_message(self, format, *args):
        """Only log successful requests, suppress error spam"""
        # Only show GET requests and errors that aren't BrokenPipe
        if args[1] in ('200', '304'):
            sys.stderr.write("%s - - [%s] %s\n" %
                           (self.address_string(),
                            self.log_date_time_string(),
                            format % args))

    def handle_one_request(self):
        """Handle one request, suppressing BrokenPipeError"""
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            # Silently ignore broken pipe errors - they're harmless
            pass

QuietHandler.extensions_map['.gpx'] = 'application/gpx+xml'

# Allow immediate restart (e.g. between test runs) while old sockets are in TIME_WAIT
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    print(f"Open http://localhost:{PORT}/index.html in your browser")
    print("Press Ctrl+C to stop the server")
    httpd.serve_forever()
