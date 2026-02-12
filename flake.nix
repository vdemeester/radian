{
  description = "Analytics and usage insights for pi-coding-agent sessions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      flake-parts,
    }:
    let
      buildRadian =
        pkgs:
        pkgs.buildNpmPackage {
          pname = "radian";
          version = "0.1.0";

          src = ./.;

          npmDepsHash = "sha256-+hbSoigBKmssmN1W4GHMDJTfKPj3sb/sAq2hvaeutc4=";

          # Build TypeScript
          buildPhase = ''
            runHook preBuild
            npx tsc
            runHook postBuild
          '';

          # Install the built output and set up the binary
          installPhase = ''
            runHook preInstall
            mkdir -p $out/lib/node_modules/radian
            cp -r dist $out/lib/node_modules/radian/
            cp package.json $out/lib/node_modules/radian/

            # Copy production node_modules (only commander)
            cp -r node_modules $out/lib/node_modules/radian/

            mkdir -p $out/bin
            ln -s $out/lib/node_modules/radian/dist/index.js $out/bin/radian
            chmod +x $out/lib/node_modules/radian/dist/index.js
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Analytics and usage insights for pi-coding-agent sessions";
            homepage = "https://github.com/vdemeester/radian";
            license = licenses.mit;
            mainProgram = "radian";
          };
        };
    in
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem =
        { pkgs, ... }:
        {
          packages = {
            radian = buildRadian pkgs;
            default = buildRadian pkgs;
          };

          checks = {
            radian = buildRadian pkgs;
          };

          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs_22
              prefetch-npm-deps
            ];
          };
        };

      flake = {
        overlays.default = _final: prev: {
          radian = buildRadian prev;
        };
      };
    };
}
