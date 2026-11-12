# GridOps regional load dispatch centre -- FUXA 1.3.0 SCADA/HMI.
#
# Deliberately pinned to 1.3.0, which is vulnerable to CVE-2026-43947
# (unauthenticated RCE via the script test-mode authorisation bypass).
# Fixed upstream in 1.3.1.
FROM frangoteam/fuxa:1.3.0




COPY seed/project.json /seed/project.json
COPY seed/seed.sh /seed/seed.sh
COPY entrypoint.sh /entrypoint.sh

# Load the dispatch project through FUXA's own API, then switch the instance
# into secure mode. Doing it at build time keeps container start deterministic.
RUN chmod +x /seed/seed.sh /entrypoint.sh && /seed/seed.sh

WORKDIR /usr/src/app/FUXA/server
EXPOSE 1881
ENTRYPOINT ["/entrypoint.sh"]
