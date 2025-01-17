/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2; -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TelemetryEvent_h__
#define TelemetryEvent_h__

#include <stdint.h>
#include "js/TypeDecls.h"
#include "mozilla/Maybe.h"
#include "mozilla/TelemetryEventEnums.h"
#include "mozilla/TelemetryProcessEnums.h"
#include "nsTArray.h"
#include "nsStringFwd.h"

namespace mozilla {
namespace Telemetry {
struct ChildEventData;
struct EventExtraEntry;
}  // namespace Telemetry
}  // namespace mozilla

using mozilla::Telemetry::EventExtraEntry;

// This module is internal to Telemetry. It encapsulates Telemetry's
// event recording and storage logic. It should only be used by
// Telemetry.cpp. These functions should not be used anywhere else.
// For the public interface to Telemetry functionality, see Telemetry.h.

namespace TelemetryEvent {

void InitializeGlobalState(bool canRecordBase, bool canRecordExtended);
void DeInitializeGlobalState();

void SetCanRecordBase(bool b);
void SetCanRecordExtended(bool b);

// C++ API Endpoint.
void RecordEventNative(
    mozilla::Telemetry::EventID aId, const mozilla::Maybe<nsCString>& aValue,
    const mozilla::Maybe<CopyableTArray<EventExtraEntry>>& aExtra);

// JS API Endpoints.
nsresult RegisterBuiltinEvents(const nsACString& aCategory,
                               JS::Handle<JS::Value> aEventData, JSContext* cx);

nsresult CreateSnapshots(uint32_t aDataset, bool aClear, uint32_t aEventLimit,
                         JSContext* aCx, uint8_t optional_argc,
                         JS::MutableHandle<JS::Value> aResult);

// Record events from child processes.
nsresult RecordChildEvents(
    mozilla::Telemetry::ProcessID aProcessType,
    const nsTArray<mozilla::Telemetry::ChildEventData>& aEvents);

// Only to be used for testing.
void ClearEvents();

size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf);

}  // namespace TelemetryEvent

#endif  // TelemetryEvent_h__
