package com.urbanairmonitor.controller

import com.urbanairmonitor.service.AlertService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/alerts")
@CrossOrigin(origins = ["*"])
class AlertController(private val alertService: AlertService) {

    @GetMapping
    fun getAlerts(
        @RequestParam(defaultValue = "false") resolved: Boolean,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) city: String?
    ) = ResponseEntity.ok(alertService.getAlerts(resolved, severity, city))

    @PutMapping("/{id}/resolve")
    fun resolve(@PathVariable id: Long) = ResponseEntity.ok(alertService.resolve(id))

    @PutMapping("/resolve-all")
    fun resolveAll() = ResponseEntity.ok(mapOf("resolved" to alertService.resolveAll()))
}
